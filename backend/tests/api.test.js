import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { testMongo } from "./mongo-helper.mjs";
import { openDatabase, verifyAudit, transaction } from "../src/db.js";
import { createApp } from "../src/app.js";
import { indiaDate, addDays } from "../src/errors.js";

let db, server, base, admin, mongo;
const password = "A-test-password-123!";
function client() {
  let cookie = "",
    csrf = "";
  return async (path, method = "GET", body, custom = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined
          ? { "Content-Type": "application/json", "X-HMS-Request": "1" }
          : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...custom,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    const data = res.headers.get("content-type")?.includes("application/json")
      ? await res.json()
      : await res.text();
    if (data.csrf) csrf = data.csrf;
    return { status: res.status, data, headers: res.headers };
  };
}
const bookingBody = (room = 12) => ({
  guest_name: "Integration Guest",
  room_id: room,
  arrival: indiaDate(),
  departure: addDays(indiaDate(), 2),
  adults: 2,
  source: "Direct",
});
before(async () => {
  mongo = await testMongo();
  db = await openDatabase(mongo.uri);
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  admin = client();
  const setup = await admin("/setup", "POST", {
    name: "Test Admin",
    email: "admin@example.test",
    password,
  });
  assert.equal(setup.status, 200);
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  await mongo.stop();
});

test("authentication: setup is one-time, unauthenticated requests are rejected", async () => {
  assert.equal((await client()("/rooms")).status, 401);
  assert.equal(
    (
      await client()("/setup", "POST", {
        name: "No",
        email: "no@test.dev",
        password,
      })
    ).status,
    409,
  );
  const user = await admin("/session");
  assert.equal(user.data.user.role, "admin");
  assert.equal(user.data.needs_setup, false);
});
test("CSRF and custom request headers protect mutations", async () => {
  const response = await admin(
    "/messages",
    "POST",
    { channel: "email", recipient: "a@b.test", subject: "Test", body: "Hello" },
    { "X-CSRF-Token": "bad" },
  );
  assert.equal(response.status, 403);
  const second = await admin("/messages", "POST", {}, { "X-HMS-Request": "" });
  assert.equal(second.status, 403);
});
test("create reservation, reject overlapping room dates and invalid date ranges", async () => {
  const first = await admin("/reservations", "POST", bookingBody());
  assert.equal(first.status, 201);
  assert.ok(first.data.reference.startsWith("AT-"));
  assert.equal(first.data.total_paise, 1700000);
  assert.equal(
    (await admin("/reservations", "POST", bookingBody())).status,
    409,
  );
  assert.equal(
    (
      await admin("/reservations", "POST", {
        ...bookingBody(13),
        departure: indiaDate(),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await admin("/reservations", "POST", {
        ...bookingBody(13),
        arrival: "2026-02-30",
      })
    ).status,
    400,
  );
  assert.equal(
    (await admin("/reservations", "POST", { ...bookingBody(13), room_id: 999 }))
      .status,
    404,
  );
});
test("adjacent dates allow back-to-back stays", async () => {
  const body = bookingBody();
  body.arrival = body.departure;
  body.departure = addDays(body.arrival, 2);
  assert.equal((await admin("/reservations", "POST", body)).status, 201);
});
test("checkout requires settlement and changes room to dirty", async () => {
  const created = await admin("/reservations", "POST", bookingBody(13)),
    id = created.data.id;
  assert.equal(
    (
      await admin(`/reservations/${id}/status`, "POST", {
        status: "checked_in",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await admin(`/reservations/${id}/status`, "POST", {
        status: "checked_out",
      })
    ).status,
    409,
  );
  const charge = await admin(`/reservations/${id}/charges`, "POST", {
    amount_paise: 50000,
    description: "Dinner",
    category: "restaurant",
  });
  assert.equal(charge.status, 201);
  const folio = (await admin(`/reservations/${id}/folio`)).data;
  assert.equal(folio.balance_paise, 950000);
  const payment = {
    amount_paise: folio.balance_paise,
    method: "cash",
    reference: "",
    idempotency_key: "test-checkout-1",
  };
  assert.equal(
    (await admin(`/reservations/${id}/payments`, "POST", payment)).status,
    201,
  );
  assert.equal(
    (
      await admin(`/reservations/${id}/status`, "POST", {
        status: "checked_out",
      })
    ).status,
    200,
  );
  assert.equal(
    (await admin("/rooms")).data.find((r) => r.id === 13).housekeeping,
    "dirty",
  );
  assert.equal(
    (
      await admin(`/reservations/${id}/charges`, "POST", {
        amount_paise: 100,
        description: "Late charge",
        category: "other",
      })
    ).status,
    409,
  );
});
test("payments are idempotent and reject conflicting retries or overpayment", async () => {
  const b = (await admin("/reservations", "POST", bookingBody(14))).data;
  const p = {
    amount_paise: 100000,
    method: "external_upi",
    reference: "UPI-TEST-42",
    idempotency_key: "same-request",
  };
  const a = await admin(`/reservations/${b.id}/payments`, "POST", p),
    repeat = await admin(`/reservations/${b.id}/payments`, "POST", p);
  assert.equal(a.status, 201);
  assert.equal(a.data.id, repeat.data.id);
  assert.equal(
    (
      await admin(`/reservations/${b.id}/payments`, "POST", {
        ...p,
        amount_paise: 2,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await admin(`/reservations/${b.id}/payments`, "POST", {
        ...p,
        idempotency_key: "over",
        amount_paise: 99999999,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await admin(`/reservations/${b.id}/payments`, "POST", {
        ...p,
        idempotency_key: "badref",
        reference: "",
      })
    ).status,
    400,
  );
  assert.equal(
    (await admin(`/reservations/${b.id}/folio`)).data.payments.length,
    1,
  );
  assert.equal(
    (
      await admin(`/reservations/${b.id}/status`, "POST", {
        status: "cancelled",
      })
    ).status,
    409,
  );
});
test("cancel unpaid bookings reverses financial balances and frees room", async () => {
  const b = (await admin("/reservations", "POST", bookingBody(15))).data;
  assert.equal(
    (
      await admin(`/reservations/${b.id}/status`, "POST", {
        status: "cancelled",
      })
    ).status,
    200,
  );
  assert.equal(
    (await admin(`/reservations/${b.id}/folio`)).data.balance_paise,
    0,
  );
  assert.equal(
    (
      await admin(`/reservations/${b.id}/status`, "POST", {
        status: "cancelled",
      })
    ).status,
    409,
  );
  assert.equal(
    (await admin("/reservations", "POST", bookingBody(15))).status,
    201,
  );
});
test("room readiness, maintenance reservations and future check-in are enforced", async () => {
  assert.equal(
    (await admin("/rooms/4", "PATCH", { housekeeping: "ready" })).status,
    409,
  );
  assert.equal(
    (await admin("/reservations", "POST", bookingBody(24))).status,
    409,
  );
  const b = (await admin("/reservations", "POST", bookingBody(21))).data;
  assert.equal(
    (
      await admin(`/reservations/${b.id}/status`, "POST", {
        status: "checked_in",
      })
    ).status,
    409,
  );
  assert.equal(
    (await admin("/rooms/21", "PATCH", { housekeeping: "ready" })).status,
    200,
  );
  assert.equal(
    (
      await admin(`/reservations/${b.id}/status`, "POST", {
        status: "checked_in",
      })
    ).status,
    200,
  );
  assert.equal(
    (await admin("/rooms/12", "PATCH", { housekeeping: "maintenance" })).status,
    409,
  );
  const future = (
    await admin("/reservations", "POST", {
      ...bookingBody(16),
      arrival: addDays(indiaDate(), 3),
      departure: addDays(indiaDate(), 4),
    })
  ).data;
  assert.equal(
    (
      await admin(`/reservations/${future.id}/status`, "POST", {
        status: "checked_in",
      })
    ).status,
    409,
  );
});
test("stock movement uses atomic nonnegative balance validation", async () => {
  const item = (await admin("/inventory")).data.find(
    (i) => i.name === "Basmati rice",
  );
  assert.equal(
    (
      await admin(`/inventory/${item.id}/movements`, "POST", {
        quantity: -999,
        reason: "Too much",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await admin(`/inventory/${item.id}/movements`, "POST", {
        quantity: 10.5,
        reason: "Supplier receipt",
      })
    ).status,
    201,
  );
  assert.equal(
    (await admin("/inventory")).data.find((i) => i.id === item.id).quantity,
    28.5,
  );
  assert.equal(
    (
      await admin(`/inventory/${item.id}/movements`, "POST", {
        quantity: -3.25,
        reason: "Kitchen issue",
      })
    ).status,
    201,
  );
  assert.equal(
    (await admin("/inventory")).data.find((i) => i.id === item.id).quantity,
    25.25,
  );
});
test("payroll validates deductions and prevents duplicate employee/month", async () => {
  const employee = (await admin("/employees")).data[0],
    b = {
      employee_id: employee.id,
      month: "2026-11",
      deduction_paise: 120000,
      note: "Reviewed by payroll supervisor",
    };
  const p = await admin("/payroll", "POST", b);
  assert.equal(p.status, 201);
  assert.equal(p.data.net_paise, employee.monthly_salary_paise - 120000);
  assert.equal((await admin("/payroll", "POST", b)).status, 409);
  assert.equal(
    (
      await admin("/payroll", "POST", {
        ...b,
        month: "2026-12",
        deduction_paise: 999999999,
      })
    ).status,
    400,
  );
});
test("tax rules are snapshotted and integer amounts stay balanced", async () => {
  const settings = (await admin("/property")).data;
  assert.equal(
    (
      await admin("/property", "PUT", {
        ...settings,
        tax_bps: 1200,
        tax_reviewed: false,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await admin("/property", "PUT", {
        ...settings,
        tax_bps: 1200,
        tax_reviewed: true,
      })
    ).status,
    200,
  );
  const b = (await admin("/reservations", "POST", bookingBody(17))).data;
  const folio = (await admin(`/reservations/${b.id}/folio`)).data;
  assert.equal(folio.tax_paise, 124800);
  await admin("/property", "PUT", {
    ...settings,
    tax_bps: 1800,
    tax_reviewed: true,
  });
  assert.equal(
    (await admin(`/reservations/${b.id}/folio`)).data.tax_paise,
    124800,
  );
  await admin("/property", "PUT", settings);
});
test("authorization blocks housekeeping from finance, guests and booking writes", async () => {
  assert.equal(
    (
      await admin("/users", "POST", {
        name: "Housekeeper",
        email: "hk@example.test",
        password,
        role: "housekeeping",
      })
    ).status,
    201,
  );
  const hk = client();
  assert.equal(
    (await hk("/login", "POST", { email: "hk@example.test", password })).status,
    200,
  );
  assert.equal((await hk("/rooms")).status, 200);
  assert.equal((await hk("/finance")).status, 403);
  assert.equal((await hk("/reservations")).status, 403);
  assert.equal(
    (await hk("/reservations", "POST", bookingBody(18))).status,
    403,
  );
  assert.equal((await hk("/users")).status, 403);
  assert.equal(
    (await hk("/rooms/22", "PATCH", { housekeeping: "cleaning" })).status,
    200,
  );
  await hk("/logout", "POST", {});
  assert.equal((await hk("/rooms")).status, 401);
});
test("all posted transactions balance, journal is append-only and audit chain verifies", async () => {
  const f = (await admin("/finance")).data;
  assert.equal(f.total_debit_paise, f.total_credit_paise);
  assert.ok(f.total_debit_paise > 0);
  const entries = await db.all("journal");
  const totals = new Map();
  for (const j of entries)
    totals.set(
      j.transaction_ref,
      (totals.get(j.transaction_ref) || 0) + j.debit_paise - j.credit_paise,
    );
  assert.ok([...totals.values()].every((n) => n === 0));
  assert.equal((await verifyAudit(db)).valid, true);
  await assert.rejects(
    () => db.update("audit", { id: 1 }, { action: "tampered" }),
    /cannot be updated/,
  );
  await assert.rejects(
    () => db.remove("journal", { id: 1 }),
    /cannot be deleted/,
  );
});
test("draft messaging persists without claiming delivery; exports and unknown routes work", async () => {
  const m = await admin("/messages", "POST", {
    channel: "email",
    recipient: "guest@example.test",
    subject: "Welcome",
    body: "We look forward to your stay.",
  });
  assert.equal(m.status, 201);
  assert.equal(m.data.status, "draft");
  assert.ok((await admin("/messages")).data.some((x) => x.id === m.data.id));
  const report = await admin("/reports/reservations");
  assert.equal(report.status, 200);
  assert.match(report.data, /guest_name/);
  assert.match(report.headers.get("content-disposition"), /attachment/);
  assert.equal((await admin("/reports/not-a-report")).status, 404);
  assert.equal((await admin("/unknown")).status, 404);
});
test("MongoDB persists records across client reconnects without seeding duplicates", async () => {
  const name = "persistence_test";
  let connection = await openDatabase(mongo.uri, { dbName: name });
  assert.equal(await connection.count("users"), 0);
  await connection.update("rooms", { id: 22 }, { housekeeping: "cleaning" });
  await connection.close();
  connection = await openDatabase(mongo.uri, { dbName: name });
  assert.equal(
    (await connection.one("rooms", { id: 22 })).housekeeping,
    "cleaning",
  );
  assert.equal(await connection.count("rooms"), 24);
  await connection.close();
});
test("concurrent booking requests cannot double-book the same room", async () => {
  const replies = await Promise.all([
    admin("/reservations", "POST", bookingBody(18)),
    admin("/reservations", "POST", bookingBody(18)),
  ]);
  assert.deepEqual(replies.map((r) => r.status).sort(), [201, 409]);
});
test("concurrent payment retries create one collection and one balanced journal", async () => {
  const b = (await admin("/reservations", "POST", bookingBody(19))).data;
  const p = {
    amount_paise: 10000,
    method: "cash",
    reference: "",
    idempotency_key: "concurrent-payment",
  };
  const replies = await Promise.all([
    admin(`/reservations/${b.id}/payments`, "POST", p),
    admin(`/reservations/${b.id}/payments`, "POST", p),
  ]);
  assert.ok(replies.every((r) => r.status === 201));
  assert.equal(replies[0].data.id, replies[1].data.id);
  assert.equal(
    (await db.all("payments", { idempotency_key: p.idempotency_key })).length,
    1,
  );
});
test("failed MongoDB transactions roll back writes and sequence changes", async () => {
  const before = await db.count("messages");
  await assert.rejects(
    () =>
      transaction(db, async () => {
        await db.insert("messages", {
          channel: "email",
          recipient: "test",
          subject: "Rollback",
          body: "no",
          status: "draft",
        });
        throw new Error("rollback-test");
      }),
    /rollback-test/,
  );
  assert.equal(await db.count("messages"), before);
});
