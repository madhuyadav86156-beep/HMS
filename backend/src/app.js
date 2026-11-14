import express from "express";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  AppError,
  requireValue,
  text,
  integer,
  oneOf,
  date,
  indiaDate,
  addDays,
} from "./errors.js";
import {
  property,
  transaction,
  audit,
  verifyAudit,
  folio,
  insertCharge,
  postJournal,
} from "./db.js";
import {
  authRoutes,
  identify,
  requestProtection,
  authenticated,
  allow,
  createUser,
} from "./auth.js";

export function createApp(db, config = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });
  app.use("/api", express.json({ limit: "64kb" }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", async (req, res) =>
    res.json({
      status: "ok",
      service: "atithi-hms",
      database: await db.ping(),
      database_engine: "mongodb",
    }),
  );
  app.use("/api", identify(db), requestProtection);
  authRoutes(app, db, config);
  app.use("/api", authenticated);
  app.get("/api/property", async (req, res) => res.json(await property(db)));
  app.put("/api/property", allow(), async (req, res) => {
    const b = req.body,
      next = {
        name: text(b.name, "Property name"),
        city: text(b.city, "City"),
        state: text(b.state, "State"),
        address: text(b.address, "Address", 300),
        gstin: String(b.gstin || "")
          .trim()
          .toUpperCase(),
        tax_bps: integer(b.tax_bps, "GST basis points", 0, 3000),
        tax_reviewed: b.tax_reviewed === true,
        currency: "INR",
      };
    requireValue(
      !next.gstin ||
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(next.gstin),
      "Enter a valid 15-character GSTIN format.",
    );
    requireValue(
      next.tax_bps === 0 || next.tax_reviewed,
      "Confirm review of the tax configuration before applying a nonzero rate.",
    );
    await transaction(db, async () => {
      await db.update("settings", { key: "property" }, { value: next });
      await audit(db, req.user.id, "property.updated", "property", 1, next);
    });
    res.json(next);
  });
  app.get(
    "/api/dashboard",
    allow("frontdesk", "accountant"),
    async (req, res) => {
      const today = indiaDate(),
        rooms = await getRooms(db),
        bookings = await getReservations(db),
        journal = await db.all("journal"),
        payments = await db.all("payments"),
        stock = await db.all("inventory");
      const roomCounts = Object.fromEntries(
        ["occupied", "available", "dirty", "cleaning", "maintenance"].map(
          (s) => [s, rooms.filter((r) => r.status === s).length],
        ),
      );
      const entries = journal.filter(
          (j) =>
            indiaDate(
              new Date(
                j.created_at.endsWith("Z") ? j.created_at : j.created_at + "Z",
              ),
            ) === today,
        ),
        revenue = entries
          .filter((j) =>
            ["Room revenue", "Services revenue"].includes(j.account),
          )
          .reduce((a, j) => a + j.credit_paise - j.debit_paise, 0);
      const chart = Array.from({ length: 7 }, (_, i) =>
        addDays(today, i - 6),
      ).map((day) => {
        const j = journal.filter(
          (j) =>
            indiaDate(
              new Date(
                j.created_at.endsWith("Z") ? j.created_at : j.created_at + "Z",
              ),
            ) === day,
        );
        return {
          day,
          room: j
            .filter((x) => x.account === "Room revenue")
            .reduce((s, x) => s + x.credit_paise - x.debit_paise, 0),
          services: j
            .filter((x) => x.account === "Services revenue")
            .reduce((s, x) => s + x.credit_paise - x.debit_paise, 0),
        };
      });
      res.json({
        today,
        total_rooms: rooms.length,
        rooms: roomCounts,
        revenue_paise: revenue,
        collections_paise: payments
          .filter(
            (p) =>
              indiaDate(
                new Date(
                  p.created_at.endsWith("Z")
                    ? p.created_at
                    : p.created_at + "Z",
                ),
              ) === today,
          )
          .reduce((a, p) => a + p.amount_paise, 0),
        receivables_paise: bookings.reduce(
          (a, b) => a + b.total_paise - b.paid_paise,
          0,
        ),
        arrivals: bookings.filter(
          (b) => b.arrival === today && b.status === "confirmed",
        ).length,
        departures: bookings.filter(
          (b) => b.departure === today && b.status === "checked_in",
        ).length,
        low_stock: stock.filter((i) => i.quantity <= i.reorder_level).length,
        chart,
      });
    },
  );
  app.get(
    "/api/rooms",
    allow("frontdesk", "housekeeping", "accountant"),
    async (req, res) => res.json(await getRooms(db)),
  );
  app.post("/api/rooms", allow(), async (req, res) => {
    const number = text(req.body.number, "Room number", 10),
      type = oneOf(
        req.body.type,
        ["Deluxe King", "Premium Twin", "Executive Suite"],
        "room type",
      ),
      rate_paise = integer(req.body.rate_paise, "Room rate", 100, 100000000);
    const room = await transaction(db, async () => {
      requireValue(
        !(await db.one("rooms", { number })),
        "Room number already exists.",
        409,
      );
      const r = await db.insert("rooms", {
        number,
        type,
        rate_paise,
        housekeeping: "ready",
      });
      await audit(db, req.user.id, "room.created", "room", r.id, {
        number,
        type,
        rate_paise,
      });
      return r;
    });
    res.status(201).json(room);
  });
  app.patch(
    "/api/rooms/:id",
    allow("frontdesk", "housekeeping"),
    async (req, res) => {
      const id = pathId(req),
        status = oneOf(
          req.body.housekeeping,
          ["ready", "dirty", "cleaning", "maintenance"],
          "housekeeping status",
        );
      await transaction(db, async () => {
        const room = await db.one("rooms", { id });
        requireValue(room, "Room not found.", 404);
        requireValue(
          !(await db.one("reservations", {
            room_id: id,
            status: "checked_in",
          })),
          "Occupied rooms cannot change availability.",
          409,
        );
        if (status === "maintenance")
          requireValue(
            !(await db.one("reservations", {
              room_id: id,
              status: "confirmed",
              departure: { $gt: indiaDate() },
            })),
            "This room has upcoming reservations. Reassign them before maintenance.",
            409,
          );
        await db.update("rooms", { id }, { housekeeping: status });
        await audit(db, req.user.id, "room.status_changed", "room", id, {
          from: room.housekeeping,
          to: status,
        });
      });
      res.json({ ok: true });
    },
  );
  app.get(
    "/api/reservations",
    allow("frontdesk", "accountant"),
    async (req, res) => res.json(await getReservations(db)),
  );
  app.post("/api/reservations", allow("frontdesk"), async (req, res) => {
    const b = req.body,
      guest_name = text(b.guest_name, "Guest name", 100),
      arrival = date(b.arrival, "Arrival"),
      departure = date(b.departure, "Departure"),
      room_id = integer(b.room_id, "Room", 1),
      adults = integer(b.adults, "Adults", 1, 6);
    requireValue(arrival >= indiaDate(), "Arrival cannot be in the past.");
    const nights = (Date.parse(departure) - Date.parse(arrival)) / 86400000;
    requireValue(
      nights > 0 && nights <= 365,
      "Stay must be between 1 and 365 nights.",
    );
    const source = oneOf(
        b.source,
        ["Direct", "Walk-in", "Booking.com", "MakeMyTrip", "Corporate"],
        "source",
      ),
      email = String(b.email || "").trim(),
      phone = String(b.phone || "").trim(),
      notes = String(b.notes || "").trim();
    requireValue(
      email.length <= 160 &&
        (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
      "Enter a valid email.",
    );
    requireValue(
      !phone || /^[+\d ()-]{7,20}$/.test(phone),
      "Enter a valid phone number.",
    );
    requireValue(notes.length <= 1000, "Notes must be under 1,000 characters.");
    const id = await transaction(db, async () => {
      const room = await db.one("rooms", { id: room_id });
      requireValue(room, "Room not found.", 404);
      requireValue(
        room.housekeeping !== "maintenance",
        "Room is under maintenance.",
        409,
      );
      requireValue(
        !(await db.one("reservations", {
          room_id,
          status: { $in: ["confirmed", "checked_in"] },
          arrival: { $lt: departure },
          departure: { $gt: arrival },
        })),
        "Room already booked for these dates. Choose another room.",
        409,
      );
      const r = await db.insert("reservations", {
        reference: "AT-" + randomUUID().slice(0, 8).toUpperCase(),
        guest_name,
        email,
        phone,
        room_id,
        arrival,
        departure,
        adults,
        source,
        status: "confirmed",
        notes,
      });
      await insertCharge(
        db,
        r.id,
        `${nights} nights · ${room.type}`,
        "room",
        room.rate_paise * nights,
        (await property(db)).tax_bps,
      );
      await audit(db, req.user.id, "reservation.created", "reservation", r.id, {
        reference: r.reference,
        room: room.number,
        arrival,
        departure,
      });
      return r.id;
    });
    res.status(201).json(await getReservation(db, id));
  });
  app.post(
    "/api/reservations/:id/status",
    allow("frontdesk"),
    async (req, res) => {
      const id = pathId(req),
        status = oneOf(
          req.body.status,
          ["checked_in", "checked_out", "cancelled"],
          "reservation status",
        );
      await transaction(db, async () => {
        const b = await getReservation(db, id),
          room = await db.one("rooms", { id: b.room_id });
        if (status === "checked_in") {
          requireValue(
            b.status === "confirmed",
            "Only confirmed reservations can check in.",
            409,
          );
          requireValue(
            b.arrival <= indiaDate() && b.departure > indiaDate(),
            "Check-in is only available during the booked stay.",
            409,
          );
          requireValue(
            room.housekeeping === "ready",
            "Room must be ready before check-in.",
            409,
          );
          requireValue(
            !(await db.one("reservations", {
              room_id: room.id,
              status: "checked_in",
            })),
            "Another guest is checked in to this room.",
            409,
          );
        } else if (status === "checked_out") {
          requireValue(
            b.status === "checked_in",
            "Only in-house guests can check out.",
            409,
          );
          requireValue(
            (await folio(db, id)).balance_paise === 0,
            "Settle the guest folio before check-out.",
            409,
          );
          await db.update("rooms", { id: room.id }, { housekeeping: "dirty" });
        } else {
          requireValue(
            b.status === "confirmed",
            "Only confirmed reservations can be cancelled.",
            409,
          );
          const bill = await folio(db, id);
          requireValue(
            bill.paid_paise === 0,
            "This booking has payments. Refund handling is required before cancellation.",
            409,
          );
          const lines = [
            { account: "Guest receivables", credit: bill.total_paise },
          ];
          for (const category of [
            "room",
            "restaurant",
            "spa",
            "laundry",
            "other",
          ]) {
            const amount = bill.charges
              .filter((c) => c.category === category)
              .reduce((a, c) => a + c.amount_paise, 0);
            if (amount)
              lines.push({
                account:
                  category === "room" ? "Room revenue" : "Services revenue",
                debit: amount,
              });
          }
          if (bill.tax_paise)
            lines.push({ account: "GST payable", debit: bill.tax_paise });
          await postJournal(db, `cancel:${id}`, "Reservation cancelled", lines);
        }
        await db.update("reservations", { id }, { status });
        await audit(
          db,
          req.user.id,
          `reservation.${status}`,
          "reservation",
          id,
          { from: b.status },
        );
      });
      res.json(await getReservation(db, id));
    },
  );
  app.get(
    "/api/reservations/:id/folio",
    allow("frontdesk", "accountant"),
    async (req, res) => {
      const id = pathId(req);
      res.json({
        reservation: await getReservation(db, id),
        ...(await folio(db, id)),
        property: await property(db),
      });
    },
  );
  app.post(
    "/api/reservations/:id/charges",
    allow("frontdesk", "accountant"),
    async (req, res) => {
      const id = pathId(req),
        amount = integer(req.body.amount_paise, "Amount", 1, 100000000),
        description = text(req.body.description, "Description", 200),
        category = oneOf(
          req.body.category,
          ["restaurant", "spa", "laundry", "other"],
          "charge category",
        );
      await transaction(db, async () => {
        const b = await getReservation(db, id);
        requireValue(
          b.status === "checked_in",
          "Services can only be posted to an in-house guest.",
          409,
        );
        const chargeId = await insertCharge(
          db,
          id,
          description,
          category,
          amount,
          (await property(db)).tax_bps,
        );
        await audit(db, req.user.id, "charge.posted", "charge", chargeId, {
          reservation_id: id,
          amount_paise: amount,
          category,
        });
      });
      res.status(201).json(await folio(db, id));
    },
  );
  app.post(
    "/api/reservations/:id/payments",
    allow("frontdesk", "accountant"),
    async (req, res) => {
      const id = pathId(req),
        amount = integer(req.body.amount_paise, "Amount", 1, 100000000),
        method = oneOf(
          req.body.method,
          ["cash", "bank_transfer", "external_upi", "external_card"],
          "payment method",
        ),
        reference = String(req.body.reference || "").trim(),
        key = text(req.body.idempotency_key, "Idempotency key", 100);
      requireValue(reference.length <= 120, "Reference is too long.");
      requireValue(
        method === "cash" || reference.length >= 4,
        "A transaction reference is required for external payments.",
      );
      const result = await transaction(db, async () => {
        const existing = await db.one("payments", { idempotency_key: key });
        if (existing) {
          requireValue(
            existing.reservation_id === id &&
              existing.amount_paise === amount &&
              existing.method === method &&
              existing.reference === reference,
            "Idempotency key already used for another payment.",
            409,
          );
          return existing;
        }
        const b = await getReservation(db, id);
        requireValue(
          ["confirmed", "checked_in"].includes(b.status),
          "Cannot collect against a closed reservation.",
          409,
        );
        requireValue(
          amount <= (await folio(db, id)).balance_paise,
          "Payment exceeds outstanding balance.",
          409,
        );
        const p = await db.insert("payments", {
          reservation_id: id,
          amount_paise: amount,
          method,
          reference,
          idempotency_key: key,
        });
        await postJournal(
          db,
          `payment:${p.id}`,
          `Collection for ${b.reference}`,
          [
            {
              account: method === "cash" ? "Cash" : "Bank clearing",
              debit: amount,
            },
            { account: "Guest receivables", credit: amount },
          ],
        );
        await audit(db, req.user.id, "payment.recorded", "payment", p.id, {
          reservation_id: id,
          amount_paise: amount,
          method,
        });
        return p;
      });
      res.status(201).json(result);
    },
  );
  app.get("/api/finance", allow("accountant"), async (req, res) =>
    res.json(await finance(db)),
  );
  app.get(
    "/api/payments",
    allow("frontdesk", "accountant"),
    async (req, res) => {
      const bookings = await db.all("reservations");
      res.json(
        (await db.all("payments", {}, { id: -1 })).map((p) => {
          const b = bookings.find((b) => b.id === p.reservation_id);
          return {
            ...p,
            reservation_reference: b?.reference,
            guest_name: b?.guest_name,
          };
        }),
      );
    },
  );
  app.get(
    "/api/inventory",
    allow("frontdesk", "accountant"),
    async (req, res) =>
      res.json(
        (await db.all("inventory")).sort(
          (a, b) =>
            Number(b.quantity <= b.reorder_level) -
              Number(a.quantity <= a.reorder_level) ||
            a.name.localeCompare(b.name),
        ),
      ),
  );
  app.post(
    "/api/inventory",
    allow("frontdesk", "accountant"),
    async (req, res) => {
      const name = text(req.body.name, "Item name"),
        unit = text(req.body.unit, "Unit", 20),
        vendor = text(req.body.vendor, "Vendor"),
        reorder_level = quantity(req.body.reorder_level, "Reorder level", true),
        name_key = name.toLowerCase();
      const item = await transaction(db, async () => {
        requireValue(
          !(await db.one("inventory", { name_key })),
          "Item already exists.",
          409,
        );
        const i = await db.insert("inventory", {
          name,
          name_key,
          unit,
          vendor,
          reorder_level,
          quantity: 0,
        });
        await audit(db, req.user.id, "inventory.created", "inventory", i.id, {
          name,
        });
        return i;
      });
      res.status(201).json(item);
    },
  );
  app.post(
    "/api/inventory/:id/movements",
    allow("frontdesk", "accountant"),
    async (req, res) => {
      const id = pathId(req),
        amount = quantity(req.body.quantity, "Quantity"),
        reason = text(req.body.reason, "Reason", 200);
      await transaction(db, async () => {
        const item = await db.one("inventory", { id });
        requireValue(item, "Item not found.", 404);
        requireValue(item.quantity + amount >= 0, "Insufficient stock.", 409);
        await db.update(
          "inventory",
          { id },
          { quantity: Math.round((item.quantity + amount) * 1000) / 1000 },
        );
        await db.insert("stock_movements", {
          item_id: id,
          quantity: amount,
          reason,
          user_id: req.user.id,
        });
        await audit(db, req.user.id, "inventory.moved", "inventory", id, {
          quantity: amount,
          reason,
        });
      });
      res.status(201).json({ ok: true });
    },
  );
  app.get(
    "/api/stock-movements",
    allow("frontdesk", "accountant"),
    async (req, res) => {
      const items = await db.all("inventory");
      res.json(
        (await db.all("stock_movements", {}, { id: -1 }, 100)).map((s) => {
          const i = items.find((i) => i.id === s.item_id);
          return { ...s, name: i?.name, unit: i?.unit };
        }),
      );
    },
  );
  app.get("/api/employees", allow("hr"), async (req, res) =>
    res.json(await db.all("employees", {}, { name: 1 })),
  );
  app.post("/api/employees", allow("hr"), async (req, res) => {
    const b = req.body,
      name = text(b.name, "Name"),
      department = text(b.department, "Department", 60),
      designation = text(b.designation, "Designation", 80),
      monthly_salary_paise = integer(
        b.monthly_salary_paise,
        "Monthly salary",
        100,
        100000000,
      ),
      shift = oneOf(b.shift, ["Morning", "Evening", "Night"], "shift");
    const employee = await transaction(db, async () => {
      const e = await db.insert("employees", {
        name,
        department,
        designation,
        monthly_salary_paise,
        shift,
        status: "active",
      });
      await audit(db, req.user.id, "employee.created", "employee", e.id, {
        name,
        department,
      });
      return e;
    });
    res.status(201).json(employee);
  });
  app.get("/api/payroll", allow("hr", "accountant"), async (req, res) => {
    const employees = await db.all("employees");
    res.json(
      (await db.all("payroll", {}, { month: -1, id: -1 })).map((p) => {
        const e = employees.find((e) => e.id === p.employee_id);
        return { ...p, name: e?.name, department: e?.department };
      }),
    );
  });
  app.post("/api/payroll", allow("hr"), async (req, res) => {
    const id = integer(req.body.employee_id, "Employee", 1),
      month = text(req.body.month, "Month", 7),
      deduction = integer(req.body.deduction_paise, "Deduction"),
      note = text(req.body.note, "Calculation/review note", 500);
    requireValue(
      /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
      "Enter a valid payroll month.",
    );
    const result = await transaction(db, async () => {
      const e = await db.one("employees", { id });
      requireValue(e, "Employee not found.", 404);
      requireValue(
        deduction <= e.monthly_salary_paise,
        "Deductions exceed salary.",
      );
      requireValue(
        !(await db.one("payroll", { employee_id: id, month })),
        "Payroll already recorded for this employee and month.",
        409,
      );
      const net = e.monthly_salary_paise - deduction,
        p = await db.insert("payroll", {
          employee_id: id,
          month,
          gross_paise: e.monthly_salary_paise,
          deduction_paise: deduction,
          net_paise: net,
          note,
        });
      const lines = [
        { account: "Payroll expense", debit: e.monthly_salary_paise },
      ];
      if (net) lines.push({ account: "Salary payable", credit: net });
      if (deduction)
        lines.push({
          account: "Payroll deductions payable",
          credit: deduction,
        });
      await postJournal(
        db,
        `payroll:${p.id}`,
        `Payroll ${e.name} ${month}`,
        lines,
      );
      await audit(db, req.user.id, "payroll.recorded", "payroll", p.id, {
        employee_id: id,
        month,
      });
      return p;
    });
    res.status(201).json(result);
  });
  app.get("/api/messages", allow("frontdesk"), async (req, res) =>
    res.json(await db.all("messages", {}, { id: -1 })),
  );
  app.post("/api/messages", allow("frontdesk"), async (req, res) => {
    const channel = oneOf(
        req.body.channel,
        ["email", "sms", "whatsapp"],
        "channel",
      ),
      recipient = text(req.body.recipient, "Recipient", 160),
      subject = text(req.body.subject, "Subject", 120),
      body = text(req.body.body, "Message", 3000);
    const message = await transaction(db, async () => {
      const m = await db.insert("messages", {
        channel,
        recipient,
        subject,
        body,
        status: "draft",
      });
      await audit(db, req.user.id, "message.drafted", "message", m.id, {
        channel,
      });
      return m;
    });
    res.status(201).json(message);
  });
  app.get("/api/audit", allow("accountant"), async (req, res) => {
    const users = await db.all("users");
    res.json({
      integrity: await verifyAudit(db),
      records: (await db.all("audit", {}, { id: -1 }, 200)).map((a) => ({
        ...a,
        actor_name: users.find((u) => u.id === a.actor_id)?.name || null,
      })),
    });
  });
  app.get("/api/users", allow(), async (req, res) =>
    res.json((await db.all("users")).map(({ password_hash, ...u }) => u)),
  );
  app.post("/api/users", allow(), async (req, res) =>
    res.status(201).json(await createUser(db, req.body, req.user.id)),
  );
  app.get(
    "/api/reports/:kind",
    allow("accountant", "frontdesk"),
    async (req, res) => {
      const kind = req.params.kind;
      let rows;
      if (kind === "reservations") rows = await getReservations(db);
      else if (kind === "payments") rows = await db.all("payments");
      else if (kind === "rooms") rows = await getRooms(db);
      else if (kind === "ledger") {
        requireValue(
          ["admin", "accountant"].includes(req.user.role),
          "Accountant access required.",
          403,
        );
        rows = await db.all("journal");
      } else throw new AppError(404, "Unknown report.");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="atithi-${kind}-${indiaDate()}.csv"`,
      );
      res.send(csv(rows));
    },
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  if (config.staticDir && existsSync(resolve(config.staticDir, "index.html"))) {
    app.use(express.static(config.staticDir));
    app.get("/{*path}", (req, res) =>
      res.sendFile(resolve(config.staticDir, "index.html")),
    );
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error.status ||
      (error.code === 11000
        ? 409
        : error.type === "entity.parse.failed"
          ? 400
          : 500);
    if (status === 500) console.error(error.message);
    res.status(status).json({
      error:
        error.code === 11000
          ? "A record with this unique value already exists."
          : status === 500
            ? "Unexpected server error. Please try again."
            : error.message,
    });
  });
  return app;
}
function pathId(req) {
  return integer(Number(req.params.id), "ID", 1);
}
async function getReservation(db, id) {
  const b = await db.one("reservations", { id });
  requireValue(b, "Reservation not found.", 404);
  const room = await db.one("rooms", { id: b.room_id }),
    f = await folio(db, id);
  return {
    ...b,
    room_number: room.number,
    room_type: room.type,
    rate_paise: room.rate_paise,
    total_paise: f.total_paise,
    paid_paise: f.paid_paise,
  };
}
async function getReservations(db) {
  const bookings = await db.all("reservations", {}, { arrival: -1, id: -1 }),
    rooms = await db.all("rooms"),
    charges = await db.all("charges"),
    payments = await db.all("payments");
  return bookings.map((b) => {
    const r = rooms.find((r) => r.id === b.room_id);
    return {
      ...b,
      room_number: r.number,
      room_type: r.type,
      rate_paise: r.rate_paise,
      total_paise:
        b.status === "cancelled"
          ? 0
          : charges
              .filter((c) => c.reservation_id === b.id)
              .reduce((s, c) => s + c.amount_paise + c.tax_paise, 0),
      paid_paise: payments
        .filter((p) => p.reservation_id === b.id)
        .reduce((s, p) => s + p.amount_paise, 0),
    };
  });
}
async function getRooms(db) {
  const occupied = await db.all("reservations", { status: "checked_in" });
  return (await db.all("rooms", {}, { number: 1 })).map((r) => ({
    ...r,
    status: occupied.some((b) => b.room_id === r.id)
      ? "occupied"
      : r.housekeeping === "ready"
        ? "available"
        : r.housekeeping,
  }));
}
async function finance(db) {
  const journal = await db.all("journal", {}, { id: -1 }),
    byAccount = new Map();
  for (const j of journal) {
    const b = byAccount.get(j.account) || {
      account: j.account,
      debit_paise: 0,
      credit_paise: 0,
      balance_paise: 0,
    };
    b.debit_paise += j.debit_paise;
    b.credit_paise += j.credit_paise;
    b.balance_paise += j.debit_paise - j.credit_paise;
    byAccount.set(j.account, b);
  }
  const balances = [...byAccount.values()].sort((a, b) =>
    a.account.localeCompare(b.account),
  );
  return {
    balances,
    journal: journal.slice(0, 150),
    total_debit_paise: balances.reduce((s, b) => s + b.debit_paise, 0),
    total_credit_paise: balances.reduce((s, b) => s + b.credit_paise, 0),
  };
}
function quantity(value, label, nonnegative = false) {
  requireValue(
    typeof value === "number" &&
      Number.isFinite(value) &&
      Math.abs(value) <= 100000 &&
      Math.abs(value * 1000 - Math.round(value * 1000)) < 0.0001 &&
      (nonnegative ? value >= 0 : value !== 0),
    `${label} must be a valid ${nonnegative ? "non-negative" : "non-zero"} number with up to 3 decimals.`,
  );
  return value;
}
export function csv(rows) {
  if (!rows.length) return "No records\r\n";
  const keys = Object.keys(rows[0]),
    cell = (value) =>
      '"' +
      String(value ?? "")
        .replace(/^[\s]*[=+@-]/, "'")
        .replace(/"/g, '""') +
      '"';
  return (
    "\uFEFF" +
    [keys, ...rows.map((row) => keys.map((k) => row[k]))]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
