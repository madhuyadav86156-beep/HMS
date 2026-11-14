import React, { useEffect, useRef } from "react";
import {
  X,
  ArrowUpRight,
  Inbox,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";
import { initials, label } from "./api";
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function IconButton({ children, title, className = "", ...props }) {
  return (
    <button
      className={`icon-button ${className}`}
      aria-label={title}
      title={title}
      {...props}
    >
      {children}
    </button>
  );
}
export function Badge({ children, tone = "" }) {
  const value = typeof children === "string" ? children : "";
  return (
    <span
      className={`badge ${tone || (["confirmed", "dirty", "draft", "maintenance"].includes(value) ? "amber" : ["cancelled"].includes(value) ? "red" : "green")}`}
    >
      {label(value || children)}
    </span>
  );
}
export function Avatar({ name }) {
  return <span className="avatar">{initials(name)}</span>;
}
export function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Stat({ title, value, detail, icon: Icon, accent }) {
  return (
    <div className="stat">
      <div className="stat-label">
        {title}
        <span className={`stat-icon ${accent || ""}`}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <span className="stat-detail">{detail}</span>
    </div>
  );
}
export function Empty({
  title = "Nothing here yet",
  description = "New records will appear here.",
  action,
}) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Notice({ children, danger = false }) {
  return (
    <div className={`notice ${danger ? "danger" : ""}`}>
      <AlertCircle size={17} />
      <span>{children}</span>
    </div>
  );
}
export function Spinner({ text = "Loading your workspace…" }) {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={25} />
      <span>{text}</span>
    </div>
  );
}
export function Table({ columns, rows, empty = "No records found." }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i}>
              {columns.map((c, j) => (
                <td key={j}>{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <Empty
          title={empty}
          description="Try another filter or add a record."
        />
      )}
    </div>
  );
}
export function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <div className="eyebrow">{subtitle || "ATITHI WORKSPACE"}</div>
          <h2>{title}</h2>
        </div>
        <IconButton title="Close dialog" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function Field({ label: title, children, hint, ...props }) {
  return (
    <label className="field">
      <span>{title}</span>
      {children || <input {...props} />} {hint && <small>{hint}</small>}
    </label>
  );
}
export function TextLink({ children, ...props }) {
  return (
    <button className="text-link" {...props}>
      {children}
      <ArrowUpRight size={14} />
    </button>
  );
}
