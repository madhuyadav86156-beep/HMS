import React, { useState } from "react";
import {
  BedDouble,
  IndianRupee,
  LogIn,
  LogOut,
  ArrowRight,
  ArrowUpRight,
  Download,
  Search,
  Plus,
  Utensils,
  Sparkles,
  Shirt,
  Package,
  Users,
  CreditCard,
  Clock3,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Mail,
  Settings,
  CalendarDays,
  Wallet,
  Landmark,
  Leaf,
} from "lucide-react";
import { money, day, today, label } from "./api";
import {
  Button,
  Badge,
  Avatar,
  Panel,
  Stat,
  Table,
  Notice,
  Empty,
  TextLink,
} from "./ui";
export function WorkspacePage(props) {
  switch (props.page) {
    case "overview":
      return <Overview {...props} />;
    case "reservations":
      return <Reservations {...props} />;
    case "rooms":
      return <Rooms {...props} />;
    case "pos":
      return <POS {...props} />;
    case "payments":
      return <Payments {...props} />;
    case "finance":
      return <Finance {...props} />;
    case "people":
      return <People {...props} />;
    case "inventory":
      return <Inventory {...props} />;
    case "compliance":
      return <Compliance {...props} />;
    case "messages":
      return <Messages {...props} />;
    case "reports":
      return <Reports {...props} />;
    case "settings":
      return <SettingsPage {...props} />;
    default:
      return null;
  }
}
function Guest({ row }) {
  return (
    <div className="guest">
      <Avatar name={row.guest_name} />
      <span>
        <b>{row.guest_name}</b>
        <small>{row.reference}</small>
      </span>
    </div>
  );
}
function BookingTable({ rows, action, canBook, compact = false }) {
  return (
    <Table
      rows={rows}
      columns={[
        { label: "Guest", render: (r) => <Guest row={r} /> },
        {
          label: "Room",
          render: (r) => (
            <div className="cell-stack">
              <b>{r.room_number}</b>
              <small>{r.room_type}</small>
            </div>
          ),
        },
        ...(!compact
          ? [
              {
                label: "Stay",
                render: (r) => (
                  <div className="cell-stack">
                    <b>
                      {day(r.arrival)} – {day(r.departure)}
                    </b>
                    <small>
                      {r.adults} adults · {r.source}
                    </small>
                  </div>
                ),
              },
              {
                label: "Balance",
                render: (r) => (
                  <span
                    className={
                      r.total_paise - r.paid_paise > 0 ? "amount-due" : ""
                    }
                  >
                    {money(r.total_paise - r.paid_paise)}
                  </span>
                ),
              },
            ]
          : [{ label: "Source", key: "source" }]),
        { label: "Status", render: (r) => <Badge>{r.status}</Badge> },
        {
          label: "Action",
          render: (r) => (
            <div className="row-actions">
              <Button variant="subtle" onClick={() => action("folio", r)}>
                Folio <ArrowUpRight size={12} />
              </Button>
              {canBook &&
                r.status === "confirmed" &&
                r.arrival <= today() &&
                r.departure > today() && (
                  <Button
                    variant="subtle"
                    onClick={() =>
                      action("status", { ...r, next: "checked_in" })
                    }
                  >
                    Check in
                  </Button>
                )}
              {canBook && r.status === "checked_in" && (
                <Button
                  variant="subtle"
                  onClick={() =>
                    action("status", { ...r, next: "checked_out" })
                  }
                >
                  Check out
                </Button>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}
function Overview({ data, action, go, canBook, user }) {
  const [tab, setTab] = useState("arrivals"),
    d = data.dashboard,
    b = data.reservations;
  const groups = {
    arrivals: b.filter(
      (r) => r.arrival === d.today && r.status === "confirmed",
    ),
    departures: b.filter(
      (r) => r.departure === d.today && r.status === "checked_in",
    ),
    inhouse: b.filter((r) => r.status === "checked_in"),
  };
  const chartTotal = d.chart.reduce((a, c) => a + c.room + c.services, 0),
    occupied = d.rooms.occupied,
    available = d.rooms.available,
    total = d.total_rooms || 1;
  const segments = [
    ["Occupied", occupied, "#376b55"],
    ["Available", available, "#b2c69c"],
    ["Housekeeping", d.rooms.dirty + d.rooms.cleaning, "#e3c990"],
    ["Maintenance", d.rooms.maintenance, "#e7ebe3"],
  ];
  let offset = 0;
  const gradient = segments
    .map(([, count, color]) => {
      const start = offset;
      offset += (count / total) * 100;
      return `${color} ${start}% ${offset}%`;
    })
    .join(",");
  return (
    <>
      <div className="stats-grid">
        <Stat
          title="Room occupancy"
          value={`${Math.round((occupied / total) * 100)}%`}
          detail={`${occupied} occupied of ${d.total_rooms} rooms`}
          icon={BedDouble}
        />
        <Stat
          title="Revenue posted today"
          value={money(d.revenue_paise)}
          detail="Net charges · excludes tax"
          icon={IndianRupee}
        />
        <Stat
          title="Expected arrivals"
          value={d.arrivals.toString().padStart(2, "0")}
          detail="Confirmed guests arriving today"
          icon={LogIn}
        />
        <Stat
          title="Expected departures"
          value={d.departures.toString().padStart(2, "0")}
          detail="In-house guests due out today"
          icon={LogOut}
          accent="sand"
        />
      </div>
      <div className="dashboard-row">
        <Panel
          title="Revenue overview"
          subtitle="Every transaction, in the bigger picture."
          action={
            <span className="period-chip">
              Last 7 days <Chevron />
            </span>
          }
        >
          <div className="revenue-number">
            {money(chartTotal)}
            <span>Net posted revenue</span>
          </div>
          <RevenueChart points={d.chart} />
          <div className="chart-legend">
            <span>
              <i />
              Room revenue
            </span>
            <span>
              <i />
              Services revenue
            </span>
          </div>
        </Panel>
        <Panel
          title="Room status"
          subtitle="Every room, accounted for."
          action={<TextLink onClick={() => go("rooms")}>View rooms</TextLink>}
        >
          <div className="room-visual">
            <div
              className="donut"
              style={{ background: `conic-gradient(${gradient})` }}
            >
              <div>
                <b>{d.total_rooms}</b>
                <span>Total rooms</span>
              </div>
            </div>
            <div className="room-legend">
              {segments.map(([name, count, color]) => (
                <div key={name}>
                  <span>
                    <i style={{ background: color }} />
                    {name}
                  </span>
                  <b>{count}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="panel-foot">
            <span>
              <Clock3 size={13} /> {d.rooms.dirty + d.rooms.cleaning} rooms need
              housekeeping
            </span>
            <button className="text-link" onClick={() => go("rooms")}>
              Manage <ArrowRight size={13} />
            </button>
          </div>
        </Panel>
      </div>
      <div className="dashboard-row">
        <Panel
          title="Guest activity"
          subtitle="Make every arrival feel like a welcome."
          action={
            <TextLink onClick={() => go("reservations")}>
              All reservations
            </TextLink>
          }
        >
          <div className="tabs">
            {Object.keys(groups).map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t === "inhouse" ? "In house" : label(t)}
                <span>{groups[t].length}</span>
              </button>
            ))}
          </div>
          <BookingTable
            compact
            rows={groups[tab].slice(0, 4)}
            action={action}
            canBook={canBook}
          />
          <div className="panel-foot">
            Showing {Math.min(4, groups[tab].length)} of {groups[tab].length}{" "}
            guests <span>Updated from your property records</span>
          </div>
        </Panel>
        <Panel
          title="Needs your attention"
          subtitle="A few things to keep the day running."
          action={<Badge tone="amber">3 areas</Badge>}
        >
          <Attention
            icon={Package}
            title={`${d.low_stock} supplies need replenishment`}
            text="Keep essentials ready for your guests."
            onClick={() => go("inventory")}
          />
          <Attention
            icon={Wallet}
            title={`${money(d.receivables_paise)} outstanding`}
            text="Review open guest folios and collections."
            onClick={() => go("payments")}
          />
          <Attention
            icon={ShieldCheck}
            title={
              data.property.tax_reviewed
                ? "Tax configuration reviewed"
                : "Tax configuration needs review"
            }
            text={
              data.property.tax_reviewed
                ? "Review rates before issuing tax documents."
                : "Zero tax is the initial evaluation setting."
            }
            onClick={() =>
              user.role === "admin" ? go("settings") : action("help")
            }
          />
          <div className="panel-foot">
            <Leaf size={13} />
            <span>A little attention makes a better stay.</span>
          </div>
        </Panel>
      </div>
      <div className="quick-grid">
        {[
          [
            Utensils,
            "Open point of sale",
            "Post services to a guest folio",
            "pos",
          ],
          [
            CreditCard,
            "Record a collection",
            "Keep guest balances up to date",
            "payments",
          ],
          [
            Package,
            "Check your inventory",
            "Stay ahead of low stock",
            "inventory",
          ],
          [
            FileText,
            "Download reports",
            "Take your records with you",
            "reports",
          ],
        ].map(([Icon, title, sub, id]) => (
          <button key={id} onClick={() => go(id)}>
            <Icon size={23} />
            <span>
              <b>{title}</b>
              <small>{sub}</small>
            </span>
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
    </>
  );
}
function Chevron() {
  return <span className="chevron">⌄</span>;
}
function RevenueChart({ points }) {
  const max = Math.max(
      ...points.map((p) => Math.max(p.room, p.services)),
      10000,
    ),
    top = Math.ceil(max / 100000) * 100000;
  return (
    <div className="revenue-chart">
      <svg
        viewBox="0 0 630 196"
        role="img"
        aria-label="Daily posted revenue over the last seven days"
      >
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <path
              d={`M64 ${20 + i * 45} H615`}
              stroke="#e9ede5"
              strokeDasharray="3 5"
            />
            <text x="2" y={24 + i * 45}>
              {money((top * (3 - i)) / 3).replace(".00", "")}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <g key={p.day}>
            <title>
              {day(p.day)}: Rooms {money(p.room)}, services {money(p.services)}
            </title>
            <rect
              x={85 + i * 75}
              y={155 - (Math.max(0, p.room) / top) * 135}
              width="18"
              height={(Math.max(0, p.room) / top) * 135}
              rx="3"
              fill="#64876a"
            />
            <rect
              x={108 + i * 75}
              y={155 - (Math.max(0, p.services) / top) * 135}
              width="18"
              height={(Math.max(0, p.services) / top) * 135}
              rx="3"
              fill="#c7d8b4"
            />
            <text x={86 + i * 75} y="182">
              {day(p.day)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
function Attention({ icon: Icon, title, text, onClick }) {
  return (
    <div className="attention">
      <span className="attention-icon">
        <Icon size={17} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <button aria-label={`Review ${title}`} onClick={onClick}>
        <ArrowUpRight size={16} />
      </button>
    </div>
  );
}
function Reservations({ data, action, canBook }) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const rows = data.reservations.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (r.guest_name + " " + r.reference + " " + r.room_number)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="Search reservations"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guest, reservation or room…"
          />
        </div>
        <select
          aria-label="Reservation status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["all", "confirmed", "checked_in", "checked_out", "cancelled"].map(
            (s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ),
          )}
        </select>
        <a className="button secondary" href="/api/reports/reservations">
          <Download size={15} />
          Export
        </a>
      </div>
      <Panel
        title="Reservation register"
        subtitle={`${rows.length} stays · All bookings saved to your property database`}
      >
        <BookingTable rows={rows} action={action} canBook={canBook} />
      </Panel>
    </>
  );
}
function Rooms({ data, action, canWriteRoom, user }) {
  const [status, setStatus] = useState("all");
  const rooms = data.rooms.filter(
    (r) => status === "all" || r.status === status,
  );
  return (
    <>
      <div className="room-summary-strip">
        {["available", "occupied", "dirty", "cleaning", "maintenance"].map(
          (s) => (
            <button
              key={s}
              className={status === s ? "selected" : ""}
              onClick={() => setStatus(status === s ? "all" : s)}
            >
              <span className={`status-dot ${s}`} />
              {label(s)}
              <b>{data.rooms.filter((r) => r.status === s).length}</b>
            </button>
          ),
        )}
      </div>
      <div className="toolbar">
        <span className="muted">
          {rooms.length} rooms shown · Select a status to filter
        </span>
        {user.role === "admin" && (
          <Button variant="secondary" onClick={() => action("room")}>
            <Plus size={16} />
            Add room
          </Button>
        )}
      </div>
      <div className="rooms-grid">
        {rooms.map((r) => (
          <article className={`room-card ${r.status}`} key={r.id}>
            <div>
              <BedDouble size={20} />
              <Badge>{r.status}</Badge>
            </div>
            <h2>{r.number}</h2>
            <p>{r.type}</p>
            <div className="room-card-bottom">
              <span>
                {money(r.rate_paise)} <small>/ night</small>
              </span>
              {canWriteRoom && r.status !== "occupied" && (
                <button
                  aria-label={`Update room ${r.number}`}
                  onClick={() => action("room-status", r)}
                >
                  <ArrowUpRight size={17} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!rooms.length && <Empty title="No rooms match this status" />}
    </>
  );
}
function POS({ data, action, canBook }) {
  const guests = data.reservations.filter((r) => r.status === "checked_in");
  return (
    <>
      <div className="service-grid">
        {[
          [
            Utensils,
            "Restaurant",
            "Meals, beverages and room service",
            "restaurant",
          ],
          [
            Sparkles,
            "Spa & wellness",
            "Treatments and wellness services",
            "spa",
          ],
          [Shirt, "Laundry", "Fresh linen, thoughtful service", "laundry"],
        ].map(([Icon, t, s, type]) => (
          <article className="service-card" key={type}>
            <span>
              <Icon size={27} />
            </span>
            <h2>{t}</h2>
            <p>{s}</p>
            <Button
              variant="secondary"
              onClick={() => action("charge", { category: type })}
              disabled={!guests.length}
            >
              Post to guest folio <Plus size={15} />
            </Button>
          </article>
        ))}
      </div>
      <Panel
        title="In-house guest folios"
        subtitle="Select a guest to review charges, add services or record a collection."
      >
        <BookingTable rows={guests} action={action} canBook={canBook} />
      </Panel>
    </>
  );
}
function Payments({ data, action }) {
  const rows = data.payments,
    total = rows.reduce((s, p) => s + p.amount_paise, 0),
    outstanding = data.reservations.filter((r) => r.total_paise > r.paid_paise);
  return (
    <>
      <div className="stats-grid three">
        <Stat
          title="Recorded collections"
          value={money(total)}
          detail={`${rows.length} payment records`}
          icon={CreditCard}
        />
        <Stat
          title="Outstanding balances"
          value={money(
            outstanding.reduce((s, r) => s + r.total_paise - r.paid_paise, 0),
          )}
          detail={`${outstanding.length} open guest balances`}
          icon={Wallet}
        />
        <Stat
          title="Online gateways"
          value="Not connected"
          detail="Record externally verified payments manually"
          icon={Landmark}
        />
      </div>
      <Notice>
        Cash and external collections are recorded here. This application does
        not initiate UPI charges, card payments, refunds or gateway settlements.
      </Notice>
      <Panel
        title="Open guest balances"
        subtitle="Select a folio to record a verified collection."
        action={
          <a className="button secondary" href="/api/reports/payments">
            <Download size={14} />
            Export payments
          </a>
        }
      >
        <Table
          rows={outstanding}
          columns={[
            { label: "Guest", render: (r) => <Guest row={r} /> },
            { label: "Room", key: "room_number" },
            { label: "Total", render: (r) => money(r.total_paise) },
            { label: "Paid", render: (r) => money(r.paid_paise) },
            {
              label: "Balance",
              render: (r) => (
                <b className="amount-due">
                  {money(r.total_paise - r.paid_paise)}
                </b>
              ),
            },
            {
              label: "Action",
              render: (r) => (
                <Button variant="subtle" onClick={() => action("payment", r)}>
                  Record payment
                </Button>
              ),
            },
          ]}
        />
      </Panel>
      <Panel
        className="mt"
        title="Collection register"
        subtitle="Recorded payments, including initial sample records."
      >
        <Table
          rows={rows}
          columns={[
            { label: "Guest", key: "guest_name" },
            { label: "Reservation", key: "reservation_reference" },
            { label: "Method", render: (r) => <Badge>{r.method}</Badge> },
            {
              label: "Reference",
              render: (r) => r.reference || "Cash receipt",
            },
            { label: "Amount", render: (r) => money(r.amount_paise) },
            {
              label: "Recorded",
              render: (r) =>
                day(
                  r.created_at.endsWith("Z")
                    ? r.created_at
                    : r.created_at + "Z",
                ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
function Finance({ data, action, user }) {
  const f = data.finance;
  const balance = (name) =>
    f.balances.find((b) => b.account === name)?.balance_paise || 0;
  return (
    <>
      <div className="stats-grid three">
        <Stat
          title="Guest receivables"
          value={money(balance("Guest receivables"))}
          detail="Debit balance in guest control account"
          icon={Wallet}
        />
        <Stat
          title="Tax payable"
          value={money(-balance("GST payable"))}
          detail={`Configured rate: ${data.property.tax_bps / 100}%`}
          icon={FileText}
        />
        <Stat
          title="Books balanced"
          value={
            f.total_debit_paise === f.total_credit_paise
              ? "Yes"
              : "Review needed"
          }
          detail="Total debits match total credits"
          icon={ShieldCheck}
        />
      </div>
      <Notice>
        Evaluation tax engine: one configured rate is snapshotted on each
        charge. Hospitality slab rules, CGST/SGST/IGST allocation, IRN and GSTR
        filings are not implemented.{" "}
        {user.role === "admin" && (
          <button className="text-link" onClick={() => action("property")}>
            Review configuration
          </button>
        )}
      </Notice>
      <Panel
        title="Trial balance"
        subtitle="Every charge, collection and payroll record creates balanced journal entries."
        action={
          <a className="button secondary" href="/api/reports/ledger">
            <Download size={14} />
            Export ledger
          </a>
        }
      >
        <Table
          rows={f.balances}
          columns={[
            { label: "Account", key: "account" },
            { label: "Total debits", render: (r) => money(r.debit_paise) },
            { label: "Total credits", render: (r) => money(r.credit_paise) },
            {
              label: "Balance",
              render: (r) => (
                <b>
                  {money(Math.abs(r.balance_paise))}{" "}
                  {r.balance_paise >= 0 ? "Dr" : "Cr"}
                </b>
              ),
            },
          ]}
        />
        <div className="panel-foot">
          <b>Total debits: {money(f.total_debit_paise)}</b>
          <b>Total credits: {money(f.total_credit_paise)}</b>
        </div>
      </Panel>
      <Panel
        className="mt"
        title="General journal"
        subtitle="Latest 150 entries · Corrections use reversing transactions."
      >
        <Table
          rows={f.journal}
          columns={[
            { label: "Transaction", key: "transaction_ref" },
            { label: "Account", key: "account" },
            { label: "Description", key: "description" },
            {
              label: "Debit",
              render: (r) => (r.debit_paise ? money(r.debit_paise) : "—"),
            },
            {
              label: "Credit",
              render: (r) => (r.credit_paise ? money(r.credit_paise) : "—"),
            },
          ]}
        />
      </Panel>
    </>
  );
}
function People({ data, action }) {
  const employees = data.employees;
  return (
    <>
      <div className="stats-grid three">
        <Stat
          title="Your team"
          value={employees.length}
          detail="Active employee records"
          icon={Users}
        />
        <Stat
          title="Monthly gross salaries"
          value={money(
            employees.reduce((s, e) => s + e.monthly_salary_paise, 0),
          )}
          detail="Before reviewed deductions"
          icon={IndianRupee}
        />
        <Stat
          title="Payroll records"
          value={data.payroll.length}
          detail="One record per employee per month"
          icon={CalendarDays}
        />
      </div>
      <Panel
        title="People & shifts"
        subtitle="Maintain team records and prepare monthly payroll."
        action={
          <Button onClick={() => action("employee")}>
            <Plus size={15} />
            Add employee
          </Button>
        }
      >
        <Table
          rows={employees}
          columns={[
            {
              label: "Employee",
              render: (r) => (
                <div className="guest">
                  <Avatar name={r.name} />
                  <span>
                    <b>{r.name}</b>
                    <small>{r.designation}</small>
                  </span>
                </div>
              ),
            },
            { label: "Department", key: "department" },
            { label: "Shift", render: (r) => <Badge>{r.shift}</Badge> },
            {
              label: "Monthly salary",
              render: (r) => money(r.monthly_salary_paise),
            },
            {
              label: "Action",
              render: (r) => (
                <Button variant="subtle" onClick={() => action("payroll", r)}>
                  Record payroll
                </Button>
              ),
            },
          ]}
        />
      </Panel>
      <Notice>
        Payroll uses the stored gross salary and a manually reviewed deduction
        total. PF, ESI, professional tax, TDS, attendance proration and
        statutory filings are not calculated automatically.
      </Notice>
      <Panel
        title="Payroll register"
        subtitle="Recorded payroll accruals; salary disbursement is not initiated."
      >
        <Table
          rows={data.payroll}
          columns={[
            { label: "Employee", key: "name" },
            { label: "Month", key: "month" },
            { label: "Gross", render: (r) => money(r.gross_paise) },
            { label: "Deductions", render: (r) => money(r.deduction_paise) },
            {
              label: "Net payable",
              render: (r) => <b>{money(r.net_paise)}</b>,
            },
            { label: "Review note", key: "note" },
          ]}
        />
      </Panel>
    </>
  );
}
function Inventory({ data, action }) {
  const [search, setSearch] = useState(""),
    [lowOnly, setLowOnly] = useState(false);
  const rows = data.inventory.filter(
    (i) =>
      (!lowOnly || i.quantity <= i.reorder_level) &&
      (i.name + " " + i.vendor).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="Search inventory"
            placeholder="Search supplies or vendors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant={lowOnly ? "primary" : "secondary"}
          onClick={() => setLowOnly(!lowOnly)}
        >
          Low stock only
        </Button>
        <Button onClick={() => action("inventory")}>
          <Plus size={15} />
          Add item
        </Button>
      </div>
      <Panel
        title="Stock ledger"
        subtitle="Receipts and issues are persisted with a reason and actor."
      >
        <Table
          rows={rows}
          columns={[
            {
              label: "Item",
              render: (r) => (
                <div className="cell-stack">
                  <b>{r.name}</b>
                  <small>{r.vendor}</small>
                </div>
              ),
            },
            {
              label: "In stock",
              render: (r) => (
                <b>
                  {r.quantity} {r.unit}
                </b>
              ),
            },
            {
              label: "Reorder level",
              render: (r) => `${r.reorder_level} ${r.unit}`,
            },
            {
              label: "Status",
              render: (r) => (
                <Badge tone={r.quantity <= r.reorder_level ? "amber" : "green"}>
                  {r.quantity <= r.reorder_level ? "Low stock" : "Stocked"}
                </Badge>
              ),
            },
            {
              label: "Action",
              render: (r) => (
                <Button variant="subtle" onClick={() => action("stock", r)}>
                  Receive / issue <ArrowUpRight size={12} />
                </Button>
              ),
            },
          ]}
        />
      </Panel>
      <Panel
        className="mt"
        title="Stock movements"
        subtitle="Latest 100 receipts and issues."
      >
        <Table
          rows={data["stock-movements"]}
          columns={[
            { label: "Item", key: "name" },
            {
              label: "Quantity",
              render: (r) => (
                <span className={r.quantity < 0 ? "amount-due" : "positive"}>
                  {r.quantity > 0 ? "+" : ""}
                  {r.quantity} {r.unit}
                </span>
              ),
            },
            { label: "Reason", key: "reason" },
            {
              label: "Recorded",
              render: (r) =>
                day(
                  r.created_at.endsWith("Z")
                    ? r.created_at
                    : r.created_at + "Z",
                ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
function Compliance({ data }) {
  const a = data.audit;
  return (
    <>
      <div className="service-grid">
        <div className="service-card">
          <ShieldCheck size={25} />
          <h2>Audit chain</h2>
          <Badge tone={a.integrity.valid ? "green" : "red"}>
            {a.integrity.valid ? "Verified" : "Integrity error"}
          </Badge>
          <p>
            {a.integrity.count || 0} records verified with a SHA-256 hash chain.
            The application repository rejects audit and journal updates or
            deletes.
          </p>
        </div>
        <div className="service-card">
          <FileText size={25} />
          <h2>Tax readiness</h2>
          <Badge tone={data.property.tax_reviewed ? "green" : "amber"}>
            {data.property.tax_reviewed
              ? "Rate reviewed"
              : "Configuration pending"}
          </Badge>
          <p>
            Return filing, IRN generation and statutory export schemas require
            further integration and specialist validation.
          </p>
        </div>
        <div className="service-card">
          <ShieldCheck size={25} />
          <h2>Guest compliance</h2>
          <Badge tone="amber">Not connected</Badge>
          <p>
            FRRO/C-Form, Aadhaar and PAN verification are not connected. No
            identity document images are collected.
          </p>
        </div>
      </div>
      <Notice>
        The audit chain detects changes within this database; it is not
        externally anchored immutable storage. Production requires separate
        retention, backup, privacy and access-review controls.
      </Notice>
      <Panel
        title="System audit trail"
        subtitle="Latest 200 events · Actor, action and record reference."
      >
        <Table
          rows={a.records}
          columns={[
            {
              label: "Time (IST)",
              render: (r) =>
                new Date(r.created_at).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
            },
            { label: "Actor", render: (r) => r.actor_name || "System" },
            {
              label: "Action",
              render: (r) => <Badge tone="neutral">{r.action}</Badge>,
            },
            { label: "Entity", render: (r) => `${r.entity} #${r.entity_id}` },
            {
              label: "Details",
              render: (r) => (
                <span className="audit-detail" title={r.detail}>
                  {r.detail}
                </span>
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
function Messages({ data, action }) {
  return (
    <>
      <Notice>
        Messages are saved as drafts. SMTP, SMS and WhatsApp providers are not
        connected; nothing is sent from this workspace.
      </Notice>
      <Panel
        title="Message drafts"
        subtitle="Prepare confirmations, guest updates and service messages."
        action={
          <Button onClick={() => action("message")}>
            <Plus size={15} />
            Compose draft
          </Button>
        }
      >
        <Table
          rows={data.messages}
          columns={[
            {
              label: "Channel",
              render: (r) => <Badge tone="neutral">{r.channel}</Badge>,
            },
            { label: "Recipient", key: "recipient" },
            { label: "Subject", key: "subject" },
            { label: "Status", render: (r) => <Badge>{r.status}</Badge> },
            {
              label: "Action",
              render: (r) => (
                <Button
                  variant="subtle"
                  onClick={() => action("message-view", r)}
                >
                  Read draft
                </Button>
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
function Reports({ user }) {
  const reports = [
    [
      "reservations",
      "Reservations register",
      "Guest details, dates, room assignment and balances.",
    ],
    [
      "rooms",
      "Room inventory",
      "Rates, room types and current housekeeping status.",
    ],
    [
      "payments",
      "Payment register",
      "Cash and externally recorded collection history.",
    ],
    ...(["admin", "accountant"].includes(user.role)
      ? [
          [
            "ledger",
            "General ledger",
            "Double-entry journal, transaction references and account movements.",
          ],
        ]
      : []),
  ];
  return (
    <>
      <div className="service-grid reports-grid">
        {reports.map(([id, title, description]) => (
          <article className="service-card" key={id}>
            <FileText size={26} />
            <h2>{title}</h2>
            <p>{description}</p>
            <a className="button secondary" href={`/api/reports/${id}`}>
              <Download size={15} />
              Download CSV
            </a>
          </article>
        ))}
      </div>
      <Notice>
        Reports are operational CSV exports. They are not GSTR filing files or
        Tally import formats. Monetary columns ending in <b>_paise</b> store
        integer paise; divide by 100 for rupees.
      </Notice>
      <Panel
        title="Project delivery roadmap"
        subtitle="The original 24-week / 24-day mismatch is resolved here as a proposed 24-week plan."
      >
        <div className="roadmap">
          {[
            ["01", "Weeks 1–3", "Discovery & architecture"],
            ["02", "Weeks 4–8", "PMS & inventory"],
            ["03", "Weeks 9–13", "Payments, finance & tax"],
            ["04", "Weeks 14–17", "HR, security & controls"],
            ["05", "Weeks 18–19", "Provider integrations"],
            ["06", "Weeks 20–21", "UAT & hardening"],
            ["07", "Weeks 22–24", "Pilot & deployment"],
          ].map(([n, t, l]) => (
            <div key={n}>
              <span>{n}</span>
              <b>{l}</b>
              <small>{t}</small>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
function SettingsPage({ data, action }) {
  const p = data.property;
  return (
    <>
      <div className="settings-grid">
        <Panel
          title="Property profile"
          subtitle="The details behind every stay."
          action={
            <Button variant="secondary" onClick={() => action("property")}>
              Edit property
            </Button>
          }
        >
          <dl className="property-details">
            <dt>Property</dt>
            <dd>{p.name}</dd>
            <dt>Address</dt>
            <dd>{p.address}</dd>
            <dt>State</dt>
            <dd>{p.state}</dd>
            <dt>GSTIN</dt>
            <dd>{p.gstin || "Not configured"}</dd>
            <dt>Evaluation tax rate</dt>
            <dd>
              {p.tax_bps / 100}% ·{" "}
              {p.tax_reviewed ? "Reviewed" : "Not reviewed"}
            </dd>
            <dt>Currency / timezone</dt>
            <dd>INR / Asia/Kolkata</dd>
          </dl>
        </Panel>
        <Panel
          title="Connection status"
          subtitle="Only configured integrations should be trusted."
        >
          <div className="integration-list">
            {[
              "Razorpay / Cashfree / PayU / Easebuzz",
              "Channel manager",
              "FRRO / digital KYC",
              "Email / SMS / WhatsApp",
              "Biometric attendance",
            ].map((name) => (
              <div key={name}>
                <span>{name}</span>
                <Badge tone="neutral">Not connected</Badge>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel
        className="mt"
        title="Team access"
        subtitle="Roles are enforced by the API, not just by the navigation."
        action={
          <Button onClick={() => action("user")}>
            <Plus size={15} />
            Create account
          </Button>
        }
      >
        <Table
          rows={data.users}
          columns={[
            { label: "Name", key: "name" },
            { label: "Email", key: "email" },
            {
              label: "Role",
              render: (r) => <Badge tone="neutral">{r.role}</Badge>,
            },
            {
              label: "Created",
              render: (r) =>
                day(
                  r.created_at.endsWith("Z")
                    ? r.created_at
                    : r.created_at + "Z",
                ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
