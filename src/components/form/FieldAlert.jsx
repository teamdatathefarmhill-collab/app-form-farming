import Icon from "./Icon";

const ICON = {
  danger:  "CircleAlert",
  warning: "TriangleAlert",
  info:    "Info",
  success: "CircleCheck",
};

// Peringatan di bawah field / di atas tombol. `action` = { label, onClick } opsional.
export default function FieldAlert({ tone = "info", children, action }) {
  return (
    <div className={`fh-alert fh-alert-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon name={ICON[tone]} size={18} />
      <div>{children}</div>
      {action && (
        <button type="button" className="fh-alert-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
