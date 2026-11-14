import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  Printer,
  CreditCard,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Database,
  BedDouble,
} from "lucide-react";
import { api, money, today, nextDay, rupees, day, label } from "./api";
import { Modal, Field, Button, Notice, Spinner, Badge, Table } from "./ui";

export function ActionModal({ modal, data, user, onClose, action, changed }) {
  const { type, record: r } = modal;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [arrival, setArrival] = useState(today()),
    [departure, setDeparture] = useState(nextDay(today())),
    [roomId, setRoomId] = useState(""),
    [paymentMethod, setPaymentMethod] = useState("cash");
  const [folio, setFolio] = useState(null),
    paymentKey = useRef(crypto.randomUUID());
  useEffect(() => {
    if (type === "folio" || (type === "payment" && r?.id)) {
      let live = true;
      api(`/reservations/${r.id}/folio`)
        .then((result) => {
          if (live) setFolio(result);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
      return () => {
        live = false;
      };
    }
  }, [type, r?.id]);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const b = Object.fromEntries(new FormData(e.target));
    let path,
      body,
      method = "POST";
    try {
      switch (type) {
        case "reservation":
          path = "/reservations";
          body = { ...b, room_id: Number(b.room_id), adults: Number(b.adults) };
          break;
        case "status":
          path = `/reservations/${r.id}/status`;
          body = { status: r.next };
          break;
        case "room":
          path = "/rooms";
          body = { ...b, rate_paise: rupees(b.rate) };
          break;
        case "room-status":
          path = `/rooms/${r.id}`;
          method = "PATCH";
          body = b;
          break;
        case "charge":
          path = `/reservations/${b.reservation_id}/charges`;
          body = {
            description: b.description,
            category: b.category,
            amount_paise: rupees(b.amount),
          };
          break;
        case "payment":
          path = `/reservations/${r.id}/payments`;
          body = {
            method: b.method,
            reference: b.reference || "",
            amount_paise: rupees(b.amount),
            idempotency_key: paymentKey.current,
          };
          break;
        case "inventory":
          path = "/inventory";
          body = { ...b, reorder_level: Number(b.reorder_level) };
          break;
        case "stock":
          path = `/inventory/${r.id}/movements`;
          body = {
            quantity: Number(b.quantity) * (b.direction === "issue" ? -1 : 1),
            reason: b.reason,
          };
          break;
        case "employee":
          path = "/employees";
          body = { ...b, monthly_salary_paise: rupees(b.salary) };
          break;
        case "payroll":
          path = "/payroll";
          body = {
            employee_id: r.id,
            month: b.month,
            deduction_paise: rupees(b.deductions),
            note: b.note,
          };
          break;
        case "message":
          path = "/messages";
          body = b;
          break;
        case "user":
          path = "/users";
          body = b;
          break;
        case "property":
          path = "/property";
          method = "PUT";
          body = {
            ...b,
            tax_bps: Math.round(Number(b.rate) * 100),
            tax_reviewed: b.tax_reviewed === "on",
          };
          break;
        default:
          throw new Error("Unknown action.");
      }
      const result = await api(path, { method, body });
      await changed(successMessages[type] || "Record saved.");
      if (type === "reservation") action("folio", result);
      else if (type === "charge")
        action(
          "folio",
          data.reservations.find((x) => x.id === Number(b.reservation_id)),
        );
      else if (type === "payment") action("folio", r);
      else onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const available =
    data?.rooms?.filter(
      (room) =>
        room.housekeeping !== "maintenance" &&
        !data.reservations?.some(
          (b) =>
            b.room_id === room.id &&
            ["confirmed", "checked_in"].includes(b.status) &&
            b.arrival < departure &&
            b.departure > arrival,
        ),
    ) || [];
  const selectedRoom = available.find((room) => room.id === Number(roomId)),
    nights = Math.max(
      0,
      (Date.parse(departure) - Date.parse(arrival)) / 86400000,
    );
  if (type === "folio")
    return (
      <Modal title="Guest folio" subtitle={r.reference} onClose={onClose} wide>
        {error ? (
          <Notice danger>{error}</Notice>
        ) : !folio ? (
          <Spinner />
        ) : (
          <>
            <div className="folio-sheet" id="print-folio">
              <div className="folio-heading">
                <div>
                  <span className="eyebrow">{folio.property.name}</span>
                  <h2>{r.guest_name}</h2>
                  <p>{folio.property.address}</p>
                  <p>
                    {folio.property.gstin
                      ? "GSTIN: " + folio.property.gstin
                      : "GSTIN not configured"}
                  </p>
                </div>
                <div>
                  <Badge>{r.status}</Badge>
                  <p>{r.reference}</p>
                  <p>
                    Room {r.room_number} · {day(r.arrival)} – {day(r.departure)}
                  </p>
                </div>
              </div>
              <Notice>
                {folio.cancelled
                  ? "This reservation was cancelled. Charges were reversed in the ledger."
                  : "Guest folio summary. Not an IRN e-invoice or a validated statutory tax invoice."}
              </Notice>
              <Table
                rows={folio.charges}
                columns={[
                  { label: "Description", key: "description" },
                  { label: "Amount", render: (c) => money(c.amount_paise) },
                  { label: "Tax rate", render: (c) => `${c.tax_bps / 100}%` },
                  { label: "Tax", render: (c) => money(c.tax_paise) },
                ]}
              />
              <dl className="folio-totals">
                <dt>Subtotal</dt>
                <dd>{money(folio.subtotal_paise)}</dd>
                <dt>Tax</dt>
                <dd>{money(folio.tax_paise)}</dd>
                <dt>Total {folio.cancelled ? "after reversal" : ""}</dt>
                <dd>{money(folio.total_paise)}</dd>
                <dt>Collected</dt>
                <dd>{money(folio.paid_paise)}</dd>
                <dt className="balance">Balance due</dt>
                <dd className="balance">{money(folio.balance_paise)}</dd>
              </dl>
              {folio.payments.length > 0 && (
                <>
                  <h3 className="section-label">Recorded collections</h3>
                  <Table
                    rows={folio.payments}
                    columns={[
                      { label: "Method", render: (p) => label(p.method) },
                      {
                        label: "Reference",
                        render: (p) => p.reference || "Cash",
                      },
                      { label: "Amount", render: (p) => money(p.amount_paise) },
                    ]}
                  />
                </>
              )}
            </div>
            <div className="form-actions wrap">
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer size={15} />
                Print folio
              </Button>
              {r.status === "checked_in" && (
                <Button variant="secondary" onClick={() => action("charge", r)}>
                  <Plus size={15} />
                  Add charge
                </Button>
              )}
              {["confirmed", "checked_in"].includes(r.status) &&
                folio.balance_paise > 0 && (
                  <Button onClick={() => action("payment", r)}>
                    <CreditCard size={15} />
                    Record payment
                  </Button>
                )}
              {["admin", "frontdesk"].includes(user.role) &&
                r.status === "confirmed" &&
                folio.paid_paise === 0 && (
                  <Button
                    variant="danger"
                    onClick={() =>
                      action("status", { ...r, next: "cancelled" })
                    }
                  >
                    Cancel reservation
                  </Button>
                )}
            </div>
          </>
        )}
      </Modal>
    );
  if (type === "message-view")
    return (
      <Modal title={r.subject} onClose={onClose}>
        <p className="muted">
          {r.channel} · {r.recipient} · Draft
        </p>
        <p className="message-body">{r.body}</p>
      </Modal>
    );
  if (type === "help")
    return (
      <Modal title="Your workspace guide" onClose={onClose}>
        <div className="guide">
          <p>
            <b>1. Set up your property.</b> Review the address, room rates and
            tax configuration under Settings. Sample data is included for
            evaluation.
          </p>
          <p>
            <b>2. Welcome a guest.</b> Create a reservation, assign an available
            room and check the guest in on their arrival date.
          </p>
          <p>
            <b>3. Manage their stay.</b> Post restaurant, spa or laundry charges
            to the folio. Record verified cash or external payments.
          </p>
          <p>
            <b>4. Close the stay.</b> Settle the outstanding balance, check the
            guest out and mark their room clean when ready.
          </p>
          <p>
            <b>5. Keep oversight.</b> Review your ledger, stock movements and
            audit records. Administrators can create role-restricted accounts.
          </p>
        </div>
        <Notice>
          Local single-property application with MongoDB persistence. Online
          gateway charges, statutory filings, biometric attendance and outbound
          messaging need additional integration.
        </Notice>
      </Modal>
    );
  if (type === "alerts")
    return (
      <Modal title="Workspace alerts" onClose={onClose}>
        <div className="guide">
          <p>
            <b>{data?.dashboard?.low_stock ?? "—"} low-stock items</b>
            <br />
            Review inventory before placing supplier orders.
          </p>
          <p>
            <b>
              Tax configuration:{" "}
              {data?.property.tax_reviewed ? "reviewed" : "pending review"}
            </b>
            <br />
            Configured evaluation rate: {data?.property.tax_bps / 100}%.
          </p>
          <p>
            <b>External integrations are not connected.</b>
            <br />
            Payments and message drafts do not trigger external transactions.
          </p>
        </div>
      </Modal>
    );
  return (
    <Modal
      title={titles[type] || "Update record"}
      subtitle={r?.guest_name || r?.name || "ATITHI WORKSPACE"}
      onClose={busy ? () => {} : onClose}
      wide={type === "reservation"}
    >
      <form onSubmit={submit}>
        {error && <Notice danger>{error}</Notice>}
        {type === "reservation" && (
          <>
            <Field
              label="Guest name"
              name="guest_name"
              required
              maxLength={100}
              placeholder="Full name"
            />
            <div className="form-grid">
              <Field
                label="Email (optional)"
                name="email"
                type="email"
                maxLength={160}
              />
              <Field label="Phone (optional)" name="phone" maxLength={20} />
            </div>
            <div className="form-grid">
              <Field
                label="Arrival"
                name="arrival"
                type="date"
                required
                min={today()}
                value={arrival}
                onChange={(e) => {
                  setArrival(e.target.value);
                  if (departure <= e.target.value)
                    setDeparture(nextDay(e.target.value));
                  setRoomId("");
                }}
              />
              <Field
                label="Departure"
                name="departure"
                type="date"
                required
                min={nextDay(arrival)}
                value={departure}
                onChange={(e) => {
                  setDeparture(e.target.value);
                  setRoomId("");
                }}
              />
            </div>
            <Field label="Available room">
              <select
                name="room_id"
                required
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              >
                <option value="">Select a room for these dates</option>
                {available.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.number} · {room.type} · {money(room.rate_paise)} /
                    night
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field
                label="Adults"
                name="adults"
                type="number"
                required
                defaultValue={2}
                min={1}
                max={6}
              />
              <Field label="Booking source">
                <select name="source">
                  {[
                    "Direct",
                    "Walk-in",
                    "Booking.com",
                    "MakeMyTrip",
                    "Corporate",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Guest notes (optional)">
              <textarea
                name="notes"
                maxLength={1000}
                placeholder="Preferences or arrival notes"
                rows={2}
              />
            </Field>
            {selectedRoom && (
              <div className="estimate">
                <span>
                  {nights} nights · before {data.property.tax_bps / 100}%
                  configured tax
                </span>
                <b>{money(nights * selectedRoom.rate_paise)}</b>
              </div>
            )}
            <Notice>
              {data.property.tax_reviewed
                ? "The reviewed configured rate will be snapshotted on the accommodation charge."
                : "Tax configuration has not been reviewed. This is an evaluation booking; review tax settings before real billing."}
            </Notice>
          </>
        )}
        {type === "status" && (
          <>
            <p className="confirmation">
              {r.next === "checked_in"
                ? `Check ${r.guest_name} into room ${r.room_number}?`
                : r.next === "checked_out"
                  ? `Check ${r.guest_name} out of room ${r.room_number}?`
                  : `Cancel ${r.reference} for ${r.guest_name}?`}
            </p>
            <Notice>
              {r.next === "checked_in"
                ? "The room must be ready and the current date must fall within the booked stay."
                : r.next === "checked_out"
                  ? "The folio must be fully settled. This room will be marked dirty for housekeeping."
                  : "Only unpaid, confirmed reservations can be cancelled. The accommodation charge will be reversed in the ledger."}
            </Notice>
          </>
        )}
        {type === "room" && (
          <>
            <Field label="Room number" name="number" required maxLength={10} />
            <Field label="Room type">
              <select name="type">
                {["Deluxe King", "Premium Twin", "Executive Suite"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Nightly rate (₹)"
              name="rate"
              type="number"
              step="0.01"
              min="1"
              max="1000000"
              required
            />
          </>
        )}
        {type === "room-status" && (
          <>
            <p className="muted">
              Room {r.number} · {r.type}
            </p>
            <Field label="Housekeeping status">
              <select name="housekeeping" defaultValue={r.housekeeping}>
                {["ready", "dirty", "cleaning", "maintenance"].map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Notice>
              Maintenance is blocked when the room has upcoming reservations.
              Occupied rooms cannot change availability here.
            </Notice>
          </>
        )}
        {type === "charge" && (
          <>
            <Field label="In-house guest">
              <select name="reservation_id" defaultValue={r?.id || ""} required>
                <option value="">Select guest</option>
                {data.reservations
                  .filter((b) => b.status === "checked_in")
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.guest_name} · Room {b.room_number}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Service category">
              <select
                name="category"
                defaultValue={r?.category || "restaurant"}
              >
                {["restaurant", "spa", "laundry", "other"].map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Description"
              name="description"
              required
              maxLength={200}
              placeholder="e.g. Dinner at Pavilion Kitchen"
            />
            <Field
              label="Amount before tax (₹)"
              name="amount"
              type="number"
              required
              min="0.01"
              max="1000000"
              step="0.01"
            />
            <Notice>
              Configured tax of {data.property.tax_bps / 100}% will be added.
              This is a folio charge, not a card transaction.
            </Notice>
          </>
        )}
        {type === "payment" && (
          <>
            {!folio ? (
              <Spinner text="Loading guest balance…" />
            ) : (
              <div className="estimate">
                <span>Balance for {r.reference}</span>
                <b>{money(folio.balance_paise)}</b>
              </div>
            )}
            <Field
              label="Amount collected (₹)"
              name="amount"
              type="number"
              required
              min="0.01"
              max={folio ? folio.balance_paise / 100 : undefined}
              defaultValue={folio ? folio.balance_paise / 100 : undefined}
              key={folio?.balance_paise ?? "loading"}
              step="0.01"
            />
            <Field label="Collection method">
              <select
                name="method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Verified bank transfer</option>
                <option value="external_upi">UPI collected externally</option>
                <option value="external_card">Card collected externally</option>
              </select>
            </Field>
            <Field
              label={`Transaction reference ${paymentMethod === "cash" ? "(optional)" : "(required)"}`}
              name="reference"
              required={paymentMethod !== "cash"}
              minLength={paymentMethod === "cash" ? 0 : 4}
              maxLength={120}
            />
            <Notice>
              Record only money already received. This action records a
              collection; it does not charge a payment instrument.
            </Notice>
          </>
        )}
        {type === "inventory" && (
          <>
            <Field label="Item name" name="name" required maxLength={120} />
            <div className="form-grid">
              <Field
                label="Unit"
                name="unit"
                required
                maxLength={20}
                placeholder="kg, pcs, kits"
              />
              <Field
                label="Reorder level"
                name="reorder_level"
                type="number"
                required
                min={0}
                max={100000}
                step="0.001"
                defaultValue={10}
              />
            </div>
            <Field label="Vendor" name="vendor" required maxLength={120} />
            <Notice>
              New items start at zero. Use Receive / issue to record opening
              stock with a reason.
            </Notice>
          </>
        )}
        {type === "stock" && (
          <>
            <div className="estimate">
              <span>Current stock</span>
              <b>
                {r.quantity} {r.unit}
              </b>
            </div>
            <div className="form-grid">
              <Field label="Movement">
                <select name="direction">
                  <option value="receive">Receive stock</option>
                  <option value="issue">Issue stock</option>
                </select>
              </Field>
              <Field
                label={`Quantity (${r.unit})`}
                name="quantity"
                type="number"
                step="0.001"
                min="0.001"
                max="100000"
                required
              />
            </div>
            <Field
              label="Reason / supplier reference"
              name="reason"
              required
              maxLength={200}
              placeholder="e.g. Received against supplier invoice INV-22"
            />
          </>
        )}
        {type === "employee" && (
          <>
            <Field label="Employee name" name="name" required maxLength={120} />
            <div className="form-grid">
              <Field
                label="Department"
                name="department"
                required
                maxLength={60}
              />
              <Field
                label="Designation"
                name="designation"
                required
                maxLength={80}
              />
            </div>
            <Field
              label="Monthly gross salary (₹)"
              name="salary"
              type="number"
              min={1}
              max={1000000}
              step="0.01"
              required
            />
            <Field label="Shift">
              <select name="shift">
                {["Morning", "Evening", "Night"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        {type === "payroll" && (
          <>
            <div className="estimate">
              <span>Monthly gross salary</span>
              <b>{money(r.monthly_salary_paise)}</b>
            </div>
            <Field
              label="Payroll month"
              name="month"
              type="month"
              required
              defaultValue={today().slice(0, 7)}
            />
            <Field
              label="Reviewed total deductions (₹)"
              name="deductions"
              type="number"
              min={0}
              max={r.monthly_salary_paise / 100}
              step="0.01"
              defaultValue={0}
              required
            />
            <Field label="Calculation / approval note">
              <textarea
                name="note"
                required
                maxLength={500}
                rows={3}
                placeholder="Explain the reviewed deduction total and approval reference."
              />
            </Field>
            <Notice>
              Confirm deductions with your payroll reviewer. This records gross,
              deductions and net payable; no automatic statutory calculation or
              salary transfer occurs.
            </Notice>
          </>
        )}
        {type === "message" && (
          <>
            <Field label="Channel">
              <select name="channel">
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </Field>
            <Field
              label="Recipient"
              name="recipient"
              required
              maxLength={160}
            />
            <Field label="Subject" name="subject" required maxLength={120} />
            <Field label="Message">
              <textarea name="body" rows={5} required maxLength={3000} />
            </Field>
            <Notice>
              This message will be saved as a draft. No provider is connected.
            </Notice>
          </>
        )}
        {type === "user" && (
          <>
            <Field
              label="Team member name"
              name="name"
              required
              maxLength={80}
            />
            <Field
              label="Email"
              name="email"
              type="email"
              required
              maxLength={160}
            />
            <Field
              label="Initial password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
            <Field label="Access role">
              <select name="role">
                {["frontdesk", "housekeeping", "accountant", "hr", "admin"].map(
                  (role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Notice>
              Front desk manages stays; housekeeping manages rooms; accountants
              access finance; HR manages employees/payroll. Administrators have
              all permissions.
            </Notice>
          </>
        )}
        {type === "property" && (
          <>
            <Field
              label="Property name"
              name="name"
              required
              defaultValue={data.property.name}
              maxLength={120}
            />
            <Field
              label="Address"
              name="address"
              required
              defaultValue={data.property.address}
              maxLength={300}
            />
            <div className="form-grid">
              <Field
                label="City"
                name="city"
                required
                defaultValue={data.property.city}
                maxLength={120}
              />
              <Field
                label="State"
                name="state"
                required
                defaultValue={data.property.state}
                maxLength={120}
              />
            </div>
            <Field
              label="GSTIN (optional)"
              name="gstin"
              defaultValue={data.property.gstin}
              maxLength={15}
            />
            <Field
              label="Evaluation tax rate (%)"
              name="rate"
              type="number"
              min={0}
              max={30}
              step="0.01"
              defaultValue={data.property.tax_bps / 100}
              required
            />
            <label className="checkbox">
              <input
                type="checkbox"
                name="tax_reviewed"
                defaultChecked={data.property.tax_reviewed}
              />
              I have reviewed this rate for this evaluation configuration.
            </label>
            <Notice>
              This rate applies to new room and service charges only. It is not
              an automatic hospitality GST rules engine; different service
              rates, place-of-supply treatment and return filing need further
              implementation.
            </Notice>
          </>
        )}
        <div className="form-actions">
          <Button
            variant="secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || (type === "payment" && !folio)}
          >
            {busy
              ? "Saving…"
              : type === "status"
                ? r.next === "cancelled"
                  ? "Cancel reservation"
                  : "Confirm " + label(r.next)
                : type === "payment"
                  ? "Record collection"
                  : type === "reservation"
                    ? "Create reservation"
                    : type === "message"
                      ? "Save draft"
                      : "Save record"}
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
const titles = {
  reservation: "New reservation",
  status: "Update guest stay",
  room: "Add a room",
  "room-status": "Room readiness",
  charge: "Post a service charge",
  payment: "Record a collection",
  inventory: "Add inventory item",
  stock: "Stock movement",
  employee: "Add team member",
  payroll: "Record monthly payroll",
  message: "Compose a message",
  user: "Create team account",
  property: "Property configuration",
};
const successMessages = {
  reservation: "Reservation created and accommodation charge posted.",
  status: "Guest status updated.",
  room: "Room added.",
  "room-status": "Room readiness updated.",
  charge: "Service charge posted to guest folio.",
  payment: "Collection recorded.",
  stock: "Stock movement recorded.",
  payroll: "Payroll record and journal entries saved.",
  property: "Property configuration saved.",
  user: "Team account created.",
};
