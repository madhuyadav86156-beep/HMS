import { MongoClient } from "mongodb";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { indiaDate, addDays } from "./errors.js";
const context = new AsyncLocalStorage();
const names = [
  "settings",
  "users",
  "sessions",
  "rooms",
  "reservations",
  "charges",
  "payments",
  "journal",
  "inventory",
  "stock_movements",
  "employees",
  "payroll",
  "messages",
  "audit",
  "counters",
  "locks",
];
const clean = ({ _id, ...row }) => row;
export async function openDatabase(
  uri,
  { seed = true, dbName = "atithi" } = {},
) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const native = client.db(dbName);
    const hello = await native.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== "isdbgrid")
      throw new Error(
        "MongoDB must run as a replica set (or Atlas) for transactional booking and accounting.",
      );
    for (const name of names) {
      if (!(await native.listCollections({ name }).hasNext()))
        await native.createCollection(name);
    }
    const db = {
      client,
      native,
      options: () =>
        context.getStore()?.db === db
          ? { session: context.getStore().session }
          : {},
      async all(name, filter = {}, sort = { id: 1 }, limit = 0) {
        let cursor = native
          .collection(name)
          .find(filter, this.options())
          .sort(sort);
        if (limit) cursor = cursor.limit(limit);
        return (await cursor.toArray()).map(clean);
      },
      async one(name, filter = {}) {
        const row = await native
          .collection(name)
          .findOne(filter, this.options());
        return row ? clean(row) : null;
      },
      async count(name, filter = {}) {
        return native.collection(name).countDocuments(filter, this.options());
      },
      async insert(name, row) {
        const counter = await native
          .collection("counters")
          .findOneAndUpdate(
            { _id: name },
            { $inc: { value: 1 } },
            { ...this.options(), upsert: true, returnDocument: "after" },
          );
        const doc = { id: counter.value, ...row };
        if (!doc.created_at && !["settings", "sessions"].includes(name))
          doc.created_at = new Date().toISOString();
        await native.collection(name).insertOne({ ...doc }, this.options());
        return doc;
      },
      async update(name, filter, changes) {
        if (["audit", "journal"].includes(name))
          throw new Error("Append-only records cannot be updated");
        return native
          .collection(name)
          .updateOne(filter, { $set: changes }, this.options());
      },
      async remove(name, filter) {
        if (["audit", "journal"].includes(name))
          throw new Error("Append-only records cannot be deleted");
        return native.collection(name).deleteMany(filter, this.options());
      },
      async ping() {
        await native.command({ ping: 1 });
        return true;
      },
      async close() {
        await client.close();
      },
    };
    for (const name of names.filter((n) => !["counters", "locks"].includes(n)))
      await native.collection(name).createIndex({ id: 1 }, { unique: true });
    for (const [name, keys] of [
      ["settings", { key: 1 }],
      ["users", { email: 1 }],
      ["rooms", { number: 1 }],
      ["reservations", { reference: 1 }],
      ["payments", { idempotency_key: 1 }],
      ["inventory", { name_key: 1 }],
      ["payroll", { employee_id: 1, month: 1 }],
      ["sessions", { token_hash: 1 }],
    ])
      await native.collection(name).createIndex(keys, { unique: true });
    await native
      .collection("sessions")
      .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    await native
      .collection("reservations")
      .createIndex({ room_id: 1, status: 1, arrival: 1, departure: 1 });
    for (const name of ["charges", "payments"])
      await native.collection(name).createIndex({ reservation_id: 1 });
    await native.collection("journal").createIndex({ transaction_ref: 1 });
    await native
      .collection("locks")
      .updateOne(
        { _id: "writes" },
        { $setOnInsert: { revision: 0 } },
        { upsert: true },
      );
    await transaction(db, async () => {
      if (!(await db.one("settings", { key: "property" })))
        await db.insert("settings", {
          key: "property",
          value: {
            name: "The Grand Pavilion",
            city: "Jaipur",
            state: "Rajasthan",
            address: "Civil Lines, Jaipur, Rajasthan",
            gstin: "",
            tax_bps: 0,
            tax_reviewed: false,
            currency: "INR",
          },
        });
      if (seed && !(await db.count("rooms"))) await seedData(db);
    });
    return db;
  } catch (error) {
    await client.close();
    throw error;
  }
}
// A shared write lock prevents write-skew across different API processes: concurrent
// overlap checks, payments and audit-chain appends retry on the latest snapshot.
// This conservative single-property lock can become a per-property lock when tenancy is added.
export async function transaction(db, fn) {
  if (context.getStore()?.db === db) return fn();
  const session = db.client.startSession();
  try {
    return await session.withTransaction(
      () =>
        context.run({ db, session }, async () => {
          await db.native
            .collection("locks")
            .updateOne(
              { _id: "writes" },
              { $inc: { revision: 1 } },
              { session },
            );
          return fn();
        }),
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      },
    );
  } finally {
    await session.endSession();
  }
}
export async function property(db) {
  return (await db.one("settings", { key: "property" })).value;
}
export async function audit(
  db,
  actorId,
  action,
  entity,
  entityId,
  detail = {},
) {
  if (!context.getStore())
    return transaction(db, () =>
      audit(db, actorId, action, entity, entityId, detail),
    );
  const previous =
    (await db.all("audit", {}, { id: -1 }, 1))[0]?.hash || "GENESIS";
  const payload = {
    actor_id: actorId ?? null,
    action,
    entity,
    entity_id: String(entityId),
    detail: JSON.stringify(detail),
    created_at: new Date().toISOString(),
    previous_hash: previous,
  };
  return db.insert("audit", {
    ...payload,
    hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  });
}
export async function verifyAudit(db) {
  let previous = "GENESIS";
  const rows = await db.all("audit");
  for (const row of rows) {
    const { id, hash, ...payload } = row;
    if (
      row.previous_hash !== previous ||
      createHash("sha256").update(JSON.stringify(payload)).digest("hex") !==
        hash
    )
      return { valid: false, broken_at: id };
    previous = hash;
  }
  return { valid: true, count: rows.length };
}
export async function postJournal(db, reference, description, lines) {
  const debit = lines.reduce((a, l) => a + (l.debit || 0), 0),
    credit = lines.reduce((a, l) => a + (l.credit || 0), 0);
  if (debit !== credit || debit <= 0)
    throw new Error("Unbalanced journal transaction");
  for (const line of lines)
    await db.insert("journal", {
      transaction_ref: reference,
      account: line.account,
      debit_paise: line.debit || 0,
      credit_paise: line.credit || 0,
      description,
    });
}
export async function insertCharge(
  db,
  bookingId,
  description,
  category,
  amount,
  bps,
) {
  const tax = Math.round((amount * bps) / 10000);
  const charge = await db.insert("charges", {
    reservation_id: bookingId,
    description,
    category,
    amount_paise: amount,
    tax_bps: bps,
    tax_paise: tax,
  });
  const lines = [
    { account: "Guest receivables", debit: amount + tax },
    {
      account: category === "room" ? "Room revenue" : "Services revenue",
      credit: amount,
    },
  ];
  if (tax) lines.push({ account: "GST payable", credit: tax });
  await postJournal(db, `charge:${charge.id}`, description, lines);
  return charge.id;
}
export async function folio(db, id) {
  const charges = await db.all("charges", { reservation_id: id }),
    payments = await db.all("payments", { reservation_id: id });
  const subtotal = charges.reduce((a, c) => a + c.amount_paise, 0),
    tax = charges.reduce((a, c) => a + c.tax_paise, 0),
    paid = payments.reduce((a, p) => a + p.amount_paise, 0),
    cancelled = (await db.one("reservations", { id }))?.status === "cancelled";
  return {
    charges,
    payments,
    subtotal_paise: subtotal,
    tax_paise: tax,
    total_paise: cancelled ? 0 : subtotal + tax,
    paid_paise: paid,
    balance_paise: cancelled ? 0 : subtotal + tax - paid,
    cancelled,
  };
}
async function seedData(db) {
  for (let i = 0; i < 24; i++)
    await db.insert("rooms", {
      number: String(101 + i),
      type: ["Deluxe King", "Premium Twin", "Executive Suite"][i % 3],
      rate_paise: [450000, 520000, 850000][i % 3],
      housekeeping: i === 23 ? "maintenance" : i >= 20 ? "dirty" : "ready",
    });
  for (const [name, unit, quantity, reorder_level, vendor] of [
    ["Bath towels", "pcs", 24, 40, "Jaipur Linen Co."],
    ["Basmati rice", "kg", 18, 25, "Royal Foods"],
    ["Guest toiletries", "kits", 32, 50, "Stay Essentials"],
    ["Coffee beans", "kg", 30, 10, "Blue Estate"],
    ["Bed linen", "sets", 88, 30, "Jaipur Linen Co."],
  ])
    await db.insert("inventory", {
      name,
      name_key: name.toLowerCase(),
      unit,
      quantity,
      reorder_level,
      vendor,
    });
  for (const [name, department, designation, monthly_salary_paise, shift] of [
    ["Priya Sharma", "Front desk", "Front office manager", 4800000, "Morning"],
    ["Rahul Mehta", "Housekeeping", "Supervisor", 3200000, "Morning"],
    ["Aisha Khan", "Food & beverage", "Chef de partie", 4200000, "Evening"],
    ["Vikram Singh", "Security", "Security officer", 2800000, "Night"],
    ["Neha Patel", "Finance", "Accountant", 4500000, "Morning"],
  ])
    await db.insert("employees", {
      name,
      department,
      designation,
      monthly_salary_paise,
      shift,
      status: "active",
    });
  const today = indiaDate(),
    guests = [
      "Aditi Sharma",
      "Sarah Wilson",
      "Rohan Malhotra",
      "Kavya Iyer",
      "Arvind Joshi",
      "Meera Kapoor",
      "Dev Patel",
      "Sana Mirza",
    ];
  for (let i = 0; i < guests.length; i++) {
    const arrival = i < 3 ? today : addDays(today, -2),
      departure = i === 3 ? today : addDays(today, 2),
      room = await db.one("rooms", { id: i + 1 });
    const b = await db.insert("reservations", {
      reference: `AT-100${i + 1}`,
      guest_name: guests[i],
      email: "",
      phone: "",
      room_id: room.id,
      arrival,
      departure,
      adults: 2,
      source: ["Direct", "Booking.com", "MakeMyTrip"][i % 3],
      status: i < 3 ? "confirmed" : "checked_in",
      notes: "",
    });
    const nights = (Date.parse(departure) - Date.parse(arrival)) / 86400000,
      amount = room.rate_paise * nights;
    await insertCharge(
      db,
      b.id,
      `${nights} nights · ${room.type}`,
      "room",
      amount,
      0,
    );
    if (i >= 3) {
      const p = await db.insert("payments", {
        reservation_id: b.id,
        amount_paise: amount,
        method: "cash",
        reference: "Opening sample collection",
        idempotency_key: `seed-${b.id}`,
      });
      await postJournal(db, `payment:${p.id}`, "Opening sample collection", [
        { account: "Cash", debit: amount },
        { account: "Guest receivables", credit: amount },
      ]);
    }
  }
  await audit(db, null, "demo.seeded", "property", 1, {
    note: "Sample data for local evaluation. No real payment was collected.",
  });
}
