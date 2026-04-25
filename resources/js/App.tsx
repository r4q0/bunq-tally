import { useState, createContext, useContext, useEffect, useRef, useCallback } from "react";
import {
  Camera, Clock, Check, ChevronRight, Users,
  ReceiptText, Info, X, Sun, Moon, Loader2,
  Plus, Minus, Pencil, Trash2,
  BarChart3, TrendingUp, TrendingDown, Target, AlertTriangle, Sparkles,
} from "lucide-react";
import {
  api, ApiError,
  type ApiContact, type ApiReceipt, type ApiSplit,
  type ApiInsightsDashboard, type ApiBudgetStatus, type ApiBreakdownRow, type ApiCategoryMeta,
} from "./api";

// ── Types ─────────────────────────────────────────────────────────────────────

// ── Typography ────────────────────────────────────────────────────────────────

const FONT_SANS  = '"Inter", system-ui, sans-serif';
const FONT_HEAD  = '"Montserrat", "Inter", sans-serif';
const FONT_ALT   = '"Montserrat Alternates", "Montserrat", sans-serif';
const FONT_MONO  = '"Fragment Mono", "Courier New", monospace';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Friend {
  id: number;
  name: string;
  color: string;
  initials: string;
  phone?: string;
  profilePic?: string | null;
}

interface ReceiptItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

interface ReceiptLine {
  name: string;
  price: number;
  quantity: number;
  assignedTo: number[];
}

interface ReceiptSplit {
  friendId: number;
  amount: number;
}

interface PastReceipt {
  id: number;
  merchant: string;
  date: string;
  total: number;
  splitCount: number;
  splits: ReceiptSplit[];
  items: ReceiptLine[];
}

// item → friend → 0 or 1 (binary share)
type Allocations = Record<number, Record<number, number>>;

// ── bunq palette ──────────────────────────────────────────────────────────────

const BRAND = {
  red:    "#FF3B30",
  pink:   "#FF2D55",
  orange: "#FF9500",
  yellow: "#FFCC00",
  green:  "#00D17A",
  blue:   "#0A84FF",
  purple: "#AF52DE",
};

const COLOR_PALETTE = [
  BRAND.pink,
  BRAND.orange,
  BRAND.yellow,
  BRAND.green,
  BRAND.blue,
  BRAND.purple,
  BRAND.red,
];


const DARK = {
  bg:     "#000000",
  card:   "#0E0E10",
  cardHi: "#17171A",
  border: "#1F1F23",
  text:   "#FFFFFF",
  dim:    "#8E8E93",
  dimmer: "#48484A",
  brand:  BRAND.green,
  warn:   BRAND.red,
  isDark: true,
};

const LIGHT = {
  bg:     "#FFFFFF",
  card:   "#FFFFFF",
  cardHi: "#F2F2F7",
  border: "#E5E5EA",
  text:   "#000000",
  dim:    "#8E8E93",
  dimmer: "#C7C7CC",
  brand:  BRAND.green,
  warn:   BRAND.red,
  isDark: false,
};

type Theme = typeof DARK;
const ThemeCtx = createContext<Theme>(DARK);
const useTheme = () => useContext(ThemeCtx);

// ── Friends (CRUD via context) ────────────────────────────────────────────────

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "??";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isValidPhone(phone: string): boolean {
  const t = phone.trim();
  if (!t || !t.startsWith('+')) return false;
  return t.replace(/\D/g, '').length >= 7;
}

const INITIAL_FRIENDS: Friend[] = [
  { id: 1, name: "Ava", color: BRAND.pink,   initials: "AV" },
  { id: 2, name: "Tom", color: BRAND.blue,   initials: "TM" },
  { id: 3, name: "Mia", color: BRAND.purple, initials: "MI" },
  { id: 4, name: "Leo", color: BRAND.green,  initials: "LE" },
  { id: 5, name: "Zoe", color: BRAND.orange, initials: "ZO" },
];

interface FriendsCtxValue {
  friends: Friend[];
  addFriend: (name: string, color: string, phone?: string) => void | Promise<void>;
  updateFriend: (id: number, updates: Partial<Pick<Friend, "name" | "color" | "phone">>) => void | Promise<void>;
  deleteFriend: (id: number) => void | Promise<void>;
  openManager: () => void;
}

const FriendsCtx = createContext<FriendsCtxValue>({
  friends: INITIAL_FRIENDS,
  addFriend: () => {},
  updateFriend: () => {},
  deleteFriend: () => {},
  openManager: () => {},
});
const useFriends = () => useContext(FriendsCtx);

// ── Receipt data ──────────────────────────────────────────────────────────────

const receiptItems: ReceiptItem[] = [
  { id: 1, name: "Flat White",      price: 4.50,  quantity: 2 },
  { id: 2, name: "Smash Burger",    price: 13.90, quantity: 1 },
  { id: 3, name: "Fries",           price: 4.20,  quantity: 2 },
  { id: 4, name: "Sparkling Water", price: 2.80,  quantity: 1 },
  { id: 5, name: "Service",         price: 2.29,  quantity: 1 },
];

const pastReceipts: PastReceipt[] = [
  {
    id: 1,
    merchant: "Tomaso's Pizza",
    date: "Yesterday",
    total: 42.50,
    splitCount: 4,
    splits: [
      { friendId: 1, amount: 11.00 },
      { friendId: 2, amount: 11.00 },
      { friendId: 3, amount: 12.50 },
      { friendId: 4, amount: 8.00 },
    ],
    items: [
      { name: "Margherita",       price: 12.00, quantity: 1, assignedTo: [1, 2] },
      { name: "Diavola",          price: 15.00, quantity: 1, assignedTo: [3, 4] },
      { name: "Quattro Formaggi", price: 13.50, quantity: 1, assignedTo: [1, 2, 3] },
      { name: "Service",          price: 2.00,  quantity: 1, assignedTo: [1, 2, 3, 4] },
    ],
  },
  {
    id: 2,
    merchant: "Sushi House",
    date: "Fri",
    total: 58.20,
    splitCount: 3,
    splits: [
      { friendId: 2, amount: 25.80 },
      { friendId: 3, amount: 25.80 },
      { friendId: 5, amount:  6.60 },
    ],
    items: [
      { name: "Dragon Roll",   price: 14.40, quantity: 2, assignedTo: [2, 3] },
      { name: "Salmon Nigiri", price: 4.20,  quantity: 4, assignedTo: [2, 3] },
      { name: "Miso Soup",     price: 3.00,  quantity: 3, assignedTo: [2, 3, 5] },
      { name: "Edamame",       price: 3.60,  quantity: 1, assignedTo: [5] },
    ],
  },
  {
    id: 3,
    merchant: "Brew Bar",
    date: "Thu",
    total: 18.40,
    splitCount: 2,
    splits: [
      { friendId: 1, amount: 9.20 },
      { friendId: 4, amount: 9.20 },
    ],
    items: [
      { name: "IPA",          price: 6.50, quantity: 2, assignedTo: [1, 4] },
      { name: "Bitterballen", price: 5.40, quantity: 1, assignedTo: [1, 4] },
    ],
  },
  {
    id: 4,
    merchant: "Burger Joint",
    date: "Wed",
    total: 15.99,
    splitCount: 2,
    splits: [
      { friendId: 1, amount: 10.49 },
      { friendId: 4, amount:  5.50 },
    ],
    items: [
      { name: "Double Cheese", price: 10.49, quantity: 1, assignedTo: [1] },
      { name: "Classic",       price: 5.50,  quantity: 1, assignedTo: [4] },
    ],
  },
  {
    id: 5,
    merchant: "Pho 84",
    date: "Last week",
    total: 31.10,
    splitCount: 2,
    splits: [
      { friendId: 2, amount: 15.55 },
      { friendId: 3, amount: 15.55 },
    ],
    items: [
      { name: "Pho Bo",       price: 13.50, quantity: 2, assignedTo: [2, 3] },
      { name: "Spring Rolls", price: 4.10,  quantity: 1, assignedTo: [2, 3] },
    ],
  },
  {
    id: 6,
    merchant: "Corner Bakery",
    date: "Last week",
    total: 12.75,
    splitCount: 3,
    splits: [
      { friendId: 1, amount: 4.25 },
      { friendId: 3, amount: 4.25 },
      { friendId: 5, amount: 4.25 },
    ],
    items: [
      { name: "Croissant",  price: 2.55, quantity: 3, assignedTo: [1, 3, 5] },
      { name: "Flat White", price: 1.70, quantity: 3, assignedTo: [1, 3, 5] },
    ],
  },
];

// ── Allocation helpers ────────────────────────────────────────────────────────

function totalAssigned(alloc: Record<number, number> | undefined): number {
  if (!alloc) return 0;
  return Object.values(alloc).reduce((s, n) => s + n, 0);
}

function toggleAssign(alloc: Allocations, item: ReceiptItem, friendId: number): Allocations {
  const current = { ...(alloc[item.id] ?? {}) };
  const mine = current[friendId] ?? 0;
  if (mine > 0) delete current[friendId];
  else current[friendId] = 1;
  return { ...alloc, [item.id]: current };
}

function bumpAssign(alloc: Allocations, item: ReceiptItem, friendId: number, delta: number): Allocations {
  const current = { ...(alloc[item.id] ?? {}) };
  const next = (current[friendId] ?? 0) + delta;
  if (next <= 0) {
    delete current[friendId];
  } else {
    current[friendId] = next;
  }
  return { ...alloc, [item.id]: current };
}

// ── bunq rainbow wordmark ─────────────────────────────────────────────────────

function BunqMark({ size = 24 }: { size?: number }) {
  const letters = [
    { c: "b", color: BRAND.pink },
    { c: "u", color: BRAND.orange },
    { c: "n", color: BRAND.green },
    { c: "q", color: BRAND.blue },
  ];
  return (
    <span
      className="flex"
      style={{
        fontFamily: FONT_HEAD,
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.028em",
        fontStyle: "normal",
        textDecoration: "none",
        textTransform: "none",
      }}
    >
      {letters.map((l, i) => (
        <span key={i} style={{ color: l.color }}>{l.c}</span>
      ))}
    </span>
  );
}

// ── Camera framing view ───────────────────────────────────────────────────────

function CameraFraming({
  onCapture,
  onCancel,
}: { onCapture: () => void; onCancel: () => void }) {
  const theme = useTheme();
  return (
    <div
      className="mx-4 mt-2 rounded-[28px] overflow-hidden relative"
      style={{ background: "#050507", aspectRatio: "3 / 4" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none" }}
      >
        {[33.33, 66.66].map(p => (
          <g key={p}>
            <line
              x1={`${p}%`} y1="0" x2={`${p}%`} y2="100%"
              stroke="rgba(255,255,255,0.14)" strokeWidth="0.5"
            />
            <line
              x1="0" y1={`${p}%`} x2="100%" y2={`${p}%`}
              stroke="rgba(255,255,255,0.14)" strokeWidth="0.5"
            />
          </g>
        ))}
      </svg>
      <div className="absolute inset-x-[14%] top-[15%] bottom-[24%] pointer-events-none">
        {[
          "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-lg",
          "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-lg",
          "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-lg",
          "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-lg",
        ].map((cls, i) => (
          <div
            key={i}
            className={`absolute w-7 h-7 ${cls}`}
            style={{ borderColor: theme.brand }}
          />
        ))}
      </div>
      <div className="absolute top-4 inset-x-4 flex items-center justify-between z-10">
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(255,255,255,0.14)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
          aria-label="Cancel"
        >
          <X size={16} className="text-white" strokeWidth={2.5} />
        </button>
        <div
          className="px-3 py-1.5 rounded-full"
          style={{
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          <p
            className="text-white text-[10px] font-bold"
            style={{ letterSpacing: "0.12em" }}
          >
            ALIGN RECEIPT IN FRAME
          </p>
        </div>
        <div className="w-9 h-9" />
      </div>
      <div className="absolute bottom-6 inset-x-0 flex justify-center z-10">
        <button
          onClick={onCapture}
          className="flex items-center justify-center active:scale-95 transition-transform"
          style={{
            width: 68,
            height: 68,
            borderRadius: "50%",
            border: "4px solid #FFFFFF",
            background: "rgba(255,255,255,0.08)",
          }}
          aria-label="Capture"
        >
          <div
            className="rounded-full"
            style={{ width: 52, height: 52, background: "#FFFFFF" }}
          />
        </button>
      </div>
    </div>
  );
}

// ── Scanning loader ───────────────────────────────────────────────────────────

function ScanningLoader() {
  const theme = useTheme();
  return (
    <div
      className="mx-4 mt-2 rounded-[28px] flex flex-col items-center justify-center"
      style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        aspectRatio: "3 / 4",
      }}
    >
      <Loader2
        size={42}
        className="animate-spin"
        style={{ color: theme.brand }}
        strokeWidth={2}
      />
      <p className="mt-5 font-bold text-sm" style={{ color: theme.text }}>
        Reading receipt…
      </p>
      <p className="mt-1 text-xs" style={{ color: theme.dim }}>
        Identifying line items
      </p>
    </div>
  );
}

// ── Scan CTA ──────────────────────────────────────────────────────────────────

function ScanCTA({ onTap }: { onTap: () => void }) {
  const theme = useTheme();
  return (
    <div
      onClick={onTap}
      className="flex flex-col items-center justify-center cursor-pointer select-none active:opacity-70 transition-opacity"
      style={{ minHeight: "62vh" }}
    >
      <div
        className="w-40 h-40 rounded-full flex items-center justify-center"
        style={{ background: `${theme.brand}18` }}
      >
        <Camera size={72} strokeWidth={1.25} style={{ color: theme.brand }} />
      </div>
      <p
        className="mt-6 text-sm font-semibold"
        style={{ color: theme.dim, fontFamily: FONT_SANS }}
      >
        Tap to scan receipt
      </p>
    </div>
  );
}

// ── Friend selection row (horizontal) ─────────────────────────────────────────

interface FriendSelectorProps {
  allocation: Record<number, number>;
  onAssign: (friendId: number) => void;
  onManage: () => void;
}

function FriendSelector({ allocation, onAssign, onManage }: FriendSelectorProps) {
  const theme = useTheme();
  const { friends } = useFriends();

  return (
    <div className="flex flex-col">
      <p
        className="text-[10px] font-bold uppercase mb-3 px-1"
        style={{ color: theme.dim, letterSpacing: "0.18em" }}
      >
        Assign to
      </p>

      <div className="flex gap-3 overflow-x-auto pb-1 px-1 -mx-1">
        {friends.map(f => {
          const active = (allocation[f.id] ?? 0) > 0;
          return (
            <button
              key={f.id}
              onClick={() => onAssign(f.id)}
              className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform flex-shrink-0"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-xs relative transition-all overflow-hidden"
                style={{
                  background: f.color,
                  transform: active ? "scale(1.08)" : "scale(1)",
                  opacity: active ? 1 : 0.45,
                  boxShadow: active ? `0 0 16px ${f.color}80` : "none",
                }}
              >
                {f.profilePic
                  ? <img src={f.profilePic} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : f.initials}
                {active && (
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: theme.brand, border: `2px solid ${theme.bg}` }}
                  >
                    <Check size={7} className="text-white" strokeWidth={4} />
                  </div>
                )}
              </div>
              <span
                className="text-xs font-semibold"
                style={{ color: active ? theme.text : theme.dim }}
              >
                {f.name}
              </span>
            </button>
          );
        })}

        {/* Manage contacts */}
        <button
          onClick={onManage}
          className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform flex-shrink-0"
          aria-label="Manage contacts"
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{
              background: "transparent",
              border: `1.5px dashed ${theme.dimmer}`,
            }}
          >
            <Pencil size={16} style={{ color: theme.dim }} strokeWidth={2.5} />
          </div>
          <span className="text-xs font-semibold" style={{ color: theme.dim }}>
            Manage
          </span>
        </button>
      </div>
    </div>
  );
}

// ── Per-friend weight stepper (partial quantity) ─────────────────────────────

interface WeightSteppersProps {
  item: ReceiptItem;
  allocation: Record<number, number>;
  onBump: (friendId: number, delta: number) => void;
}

function WeightSteppers({ item, allocation, onBump }: WeightSteppersProps) {
  const theme = useTheme();
  const { friends } = useFriends();

  const weightSum = Object.values(allocation).reduce((s, n) => s + (n || 0), 0);
  const lineTotal = item.price * item.quantity;
  const perUnit = weightSum > 0 ? lineTotal / weightSum : 0;
  const hasQuantity = item.quantity > 1;

  const entries = Object.entries(allocation)
    .filter(([, w]) => Number(w) > 0)
    .map(([fid, w]) => ({ friendId: Number(fid), weight: Number(w) }));

  if (entries.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2 px-1">
        <p
          className="text-[10px] font-bold uppercase"
          style={{ color: theme.dim, letterSpacing: "0.18em" }}
        >
          Units per friend
        </p>
        {hasQuantity && (
          <span className="text-[10px] font-semibold" style={{ color: theme.dim }}>
            {weightSum} of ×{item.quantity}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {entries.map(({ friendId, weight }) => {
          const f = friends.find(x => x.id === friendId);
          if (!f) return null;
          const share = perUnit * weight;
          return (
            <div
              key={friendId}
              className="flex items-center gap-3 rounded-2xl px-3 py-2"
              style={{ background: theme.card, border: `1px solid ${theme.border}` }}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white overflow-hidden flex-shrink-0"
                style={{ background: f.color, fontSize: 11, fontWeight: 800 }}
              >
                {f.profilePic
                  ? <img src={f.profilePic} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : f.initials}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>
                  {f.name}
                </p>
                <p
                  className="text-[11px] font-semibold"
                  style={{ color: theme.dim, fontFeatureSettings: "'tnum'", fontFamily: FONT_MONO }}
                >
                  €{share.toFixed(2)}
                  {hasQuantity ? ` · ${weight} unit${weight === 1 ? '' : 's'}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onBump(friendId, -1)}
                  aria-label={`Decrease ${f.name} weight`}
                  className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                  style={{
                    background: "transparent",
                    border: `1.5px solid ${theme.border}`,
                    color: theme.text,
                  }}
                >
                  <Minus size={14} strokeWidth={2.5} />
                </button>
                <span
                  className="text-sm font-bold w-5 text-center"
                  style={{ color: theme.text, fontFamily: FONT_MONO, fontFeatureSettings: "'tnum'" }}
                >
                  {weight}
                </span>
                <button
                  type="button"
                  onClick={() => onBump(friendId, 1)}
                  aria-label={`Increase ${f.name} weight`}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
                  style={{ background: f.color }}
                >
                  <Plus size={14} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Contacts manager modal ────────────────────────────────────────────────────

interface FriendDraft {
  name: string;
  color: string;
  phone: string;
}

function ContactsManager({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const { friends, addFriend, updateFriend, deleteFriend } = useFriends();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<FriendDraft>({ name: "", color: BRAND.green, phone: "" });

  const startEdit = (f: Friend) => {
    setEditingId(f.id);
    setAdding(false);
    const phone = f.phone?.startsWith('tmp-') ? '' : (f.phone ?? '');
    setDraft({ name: f.name, color: f.color, phone });
  };

  const startAdd = () => {
    setAdding(true);
    setEditingId(null);
    setDraft({ name: "", color: BRAND.green, phone: "" });
  };

  const cancel = () => {
    setEditingId(null);
    setAdding(false);
  };

  const saveAdd = () => {
    if (!draft.name.trim()) return;
    addFriend(draft.name.trim(), draft.color, draft.phone.trim());
    cancel();
  };

  const saveEdit = () => {
    if (editingId === null) return;
    if (!draft.name.trim()) return;
    updateFriend(editingId, {
      name: draft.name.trim(),
      color: draft.color,
      phone: draft.phone.trim(),
    });
    cancel();
  };

  return (
    <div
      className="fixed inset-0 z-50 backdrop-blur-sm flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="rounded-t-3xl w-full max-w-sm px-6 pt-4 pb-10 max-h-[88vh] overflow-y-auto"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="w-10 h-1 rounded-full mx-auto mb-5"
          style={{ background: theme.border }}
        />

        <div className="flex items-start justify-between mb-5">
          <div>
            <h3
              className="font-black tracking-tight"
              style={{ color: theme.text, fontSize: 26, letterSpacing: "-0.02em", fontFamily: FONT_HEAD }}
            >
              Contacts
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: theme.cardHi }}
            aria-label="Close"
          >
            <X size={14} style={{ color: theme.dim }} strokeWidth={2.5} />
          </button>
        </div>

        {/* Add form or button */}
        {adding ? (
          <FriendForm
            theme={theme}
            draft={draft}
            onChange={setDraft}
            onSave={saveAdd}
            onCancel={cancel}
            primaryLabel="Add"
          />
        ) : (
          <button
            onClick={startAdd}
            className="w-full mb-4 py-3 rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            style={{ background: theme.brand, color: "#000" }}
          >
            <Plus size={16} strokeWidth={3} />
            <span className="font-black text-sm">Add Contact</span>
          </button>
        )}

        {/* Friend list */}
        <div className="flex flex-col gap-1.5">
          {friends.map(f => (
            <div key={f.id}>
              {editingId === f.id ? (
                <FriendForm
                  theme={theme}
                  draft={draft}
                  onChange={setDraft}
                  onSave={saveEdit}
                  onCancel={cancel}
                  onDelete={() => { deleteFriend(f.id); cancel(); }}
                  primaryLabel="Save"
                />
              ) : (
                <div
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                  style={{ background: theme.cardHi }}
                >
                  <FriendAvatar f={f} size={36} fontSize={12} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: theme.text, fontFamily: FONT_HEAD }}>
                      {f.name}
                    </p>
                    {f.phone && (
                      <div className="mt-0.5 flex flex-col gap-0.5">
                        {f.phone && (
                          <p className="text-[11px]" style={{ color: theme.dim, fontFamily: FONT_MONO }}>
                            {f.phone}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => startEdit(f)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity active:opacity-60 flex-shrink-0"
                    aria-label={`Edit ${f.name}`}
                  >
                    <Pencil size={14} style={{ color: theme.dim }} strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {friends.length === 0 && !adding && (
            <p
              className="text-sm text-center py-6 font-medium"
              style={{ color: theme.dim }}
            >
              No contacts yet. Add one to start splitting.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Friend form (used by ContactsManager for both add and edit) ───────────────

interface FriendFormProps {
  theme: Theme;
  draft: FriendDraft;
  onChange: (d: FriendDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  primaryLabel: string;
}

function FriendForm({
  theme,
  draft,
  onChange,
  onSave,
  onCancel,
  onDelete,
  primaryLabel,
}: FriendFormProps) {
  const phoneOk = isValidPhone(draft.phone);
  const phoneError = draft.phone.trim() && !phoneOk
    ? 'Include country code: +31 6 12345678'
    : null;
  const canSave = !!draft.name.trim() && phoneOk;

  return (
    <div
      className="rounded-2xl p-4 mb-4"
      style={{ background: theme.cardHi, border: `1px solid ${theme.border}` }}
    >
      <p
        className="text-[10px] font-bold uppercase mb-2"
        style={{ color: theme.dim, letterSpacing: "0.18em", fontFamily: FONT_HEAD }}
      >
        Name
      </p>
      <input
        type="text"
        value={draft.name}
        onChange={e => onChange({ ...draft, name: e.target.value })}
        autoFocus
        placeholder="Contact name"
        className="w-full bg-transparent text-base font-semibold focus:outline-none"
        style={{ color: theme.text, fontFamily: FONT_HEAD }}
        onKeyDown={e => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
      />

      <div
        className="mt-3 pt-3 flex flex-col gap-2"
        style={{ borderTop: `1px solid ${theme.border}` }}
      >
        <p
          className="text-[10px] font-bold uppercase"
          style={{ color: theme.dim, letterSpacing: "0.18em", fontFamily: FONT_HEAD }}
        >
          Phone
        </p>
        <input
          type="tel"
          value={draft.phone}
          onChange={e => onChange({ ...draft, phone: e.target.value })}
          placeholder="+31 6 00000000"
          className="w-full bg-transparent text-sm focus:outline-none"
          style={{ color: theme.text, fontFamily: FONT_MONO }}
        />
        {phoneError && (
          <p className="text-[10px] font-semibold" style={{ color: BRAND.red }}>
            ⚠ {phoneError}
          </p>
        )}
      </div>

      <div
        className="mt-3 pt-3 flex items-center justify-between"
        style={{ borderTop: `1px solid ${theme.border}` }}
      >
        <p
          className="text-[10px] font-bold uppercase"
          style={{ color: theme.dim, letterSpacing: "0.18em" }}
        >
          Color
        </p>
        <div className="flex items-center gap-2">
          {COLOR_PALETTE.map(c => {
            const active = c === draft.color;
            return (
              <button
                key={c}
                onClick={() => onChange({ ...draft, color: c })}
                className="w-6 h-6 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{
                  background: c,
                  boxShadow: active ? `0 0 0 2px ${theme.card}, 0 0 0 4px ${c}` : "none",
                }}
                aria-label={`Use color ${c}`}
              >
                {active && <Check size={11} className="text-white" strokeWidth={4} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {onDelete && (
          <button
            onClick={onDelete}
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition-transform active:scale-90"
            style={{ background: `${BRAND.red}1A` }}
            aria-label="Delete contact"
          >
            <Trash2 size={15} style={{ color: BRAND.red }} strokeWidth={2.5} />
          </button>
        )}
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-2xl text-sm font-bold transition-opacity active:opacity-70"
          style={{ background: theme.card, color: theme.dim, border: `1px solid ${theme.border}` }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!canSave}
          className="flex-1 py-2.5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-40"
          style={{ background: theme.brand, color: "#000" }}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}

// ── Tally screen ──────────────────────────────────────────────────────────────

type TallyPhase = "start" | "camera" | "scanning" | "split" | "sending" | "done";

type FailedSend = { name: string; phone: string; message: string };

type LiveSplit = ApiSplit & { contact: ApiContact | null; paid_at?: string | null };

interface TallyScreenProps {
  onReceiptOpenChange: (open: boolean) => void;
}

interface ScannedReceipt {
  id: number;
  merchant: string;
  date: string | null;
  currency: string;
  items: ReceiptItem[];
  imageUrl: string | null;
}

function TallyScreen({ onReceiptOpenChange }: TallyScreenProps) {
  const theme = useTheme();
  const { friends, openManager } = useFriends();
  const [phase, setPhase] = useState<TallyPhase>("start");
  const [selected, setSelected] = useState<number | null>(null);
  const [allocations, setAllocations] = useState<Allocations>({});
  const [scanned, setScanned] = useState<ScannedReceipt | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [splitWarnings, setSplitWarnings] = useState<string[]>([]);
  const [failedSends, setFailedSends] = useState<FailedSend[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [liveSplits, setLiveSplits] = useState<LiveSplit[]>([]);
  const [pollingActive, setPollingActive] = useState(false);
  const [budgetToast, setBudgetToast] = useState<{
    label: string;
    color: string;
    pct: number;
    status: "warning" | "over";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentItems: ReceiptItem[] = scanned?.items ?? receiptItems;

  const handleAssign = (friendId: number) => {
    if (selected === null) return;
    const item = currentItems.find(i => i.id === selected);
    if (!item) return;
    setAllocations(prev => toggleAssign(prev, item, friendId));
  };

  const handleBump = (friendId: number, delta: number) => {
    if (selected === null) return;
    const item = currentItems.find(i => i.id === selected);
    if (!item) return;
    setAllocations(prev => bumpAssign(prev, item, friendId, delta));
  };

  const startScan = () => {
    setErrorMessage(null);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPhase("scanning");
    onReceiptOpenChange(true);

    try {
      const result = await api.scanReceipt(file);
      // Use persisted DB item IDs from the backend so allocations map correctly.
      const itemsFromDb = result.receipt.items?.map((it) => ({
        id: it.id,
        name: it.item_name,
        price: Number(it.price),
        quantity: Number(it.quantity) || 1,
      })) ?? [];
      const items: ReceiptItem[] = itemsFromDb.length > 0
        ? itemsFromDb
        : result.parsed.items.map((it, i) => ({
            id: i + 1,
            name: it.name,
            price: it.price,
            quantity: 1,
          }));

      setScanned({
        id: result.receipt.id,
        merchant: result.parsed.merchant ?? "Receipt",
        date: result.parsed.date,
        currency: result.parsed.currency ?? "EUR",
        items,
        imageUrl: result.image_url,
      });
      setAllocations({});
      setPhase("split");

      // Surface the most-impacted budget that just crossed warning/over.
      // Soft-fail: a missing endpoint or empty response just skips the toast.
      try {
        const { data: budgets } = await api.getBudgetStatus();
        const tripped = budgets
          .filter(b => b.status === "over" || b.status === "warning")
          .sort((a, b) => b.pct_used - a.pct_used)[0];
        if (tripped) {
          setBudgetToast({
            label: tripped.label,
            color: tripped.color,
            pct: tripped.pct_used,
            status: tripped.status as "warning" | "over",
          });
        }
      } catch {
        // ignore
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not scan receipt";
      setErrorMessage(message);
      setPhase("start");
      onReceiptOpenChange(false);
    }
  };

  const captureReceipt = () => {
    fileInputRef.current?.click();
  };

  const buildAllocationsPayload = () =>
    currentItems
      .filter(item => totalAssigned(allocations[item.id] ?? {}) > 0)
      .map(item => ({
        receipt_item_id: item.id,
        allocations: Object.entries(allocations[item.id] ?? {})
          .filter(([, w]) => Number(w) > 0)
          .map(([contactId, weight]) => ({
            contact_id: Number(contactId),
            weight: Math.max(1, Number(weight) | 0),
          })),
      }));

  const handleConfirm = async () => {
    if (!scanned) {
      setErrorMessage("Scan a receipt first.");
      return;
    }

    setPhase("sending");
    setErrorMessage(null);

    try {
      await api.saveAllocations(scanned.id, buildAllocationsPayload());
      const splitResult = await api.splitReceipt(scanned.id);

      const sends = splitResult.splits.map(s => {
        const phone = s.contact?.phone_number;
        const name = s.contact?.name ?? "friend";
        if (!phone || phone.startsWith('tmp-')) {
          return { phone: null as null, name, message: '' };
        }
        const amount = Number(s.amount).toFixed(2);
        const baseLine = `Hi ${name}! Your share for ${scanned.merchant} on Tally is ${scanned.currency} ${amount}.`;
        const message = s.payment_url
          ? `${baseLine}\nPay securely with bunq.me: ${s.payment_url}`
          : `${baseLine}\nReply here when you've sent it.`;
        return { phone, name, message };
      });

      const whatsappOutcomes = await Promise.allSettled(
        sends.map(s =>
          s.phone
            ? api.sendWhatsapp({ phone_number: s.phone, message: s.message })
            : Promise.reject(new Error("No phone number on file"))
        ),
      );

      const warnings: string[] = [];
      const newFailedSends: FailedSend[] = [];
      whatsappOutcomes.forEach((outcome, idx) => {
        if (outcome.status === "rejected") {
          const s = sends[idx];
          const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
          warnings.push(`${s.name}: ${reason}`);
          if (s.phone) {
            newFailedSends.push({ name: s.name, phone: s.phone, message: s.message });
          }
        }
      });

      const missingLinks = splitResult.splits.filter(s => !s.payment_url).length;
      const notes: string[] = [];
      if (!splitResult.bunq_available) {
        notes.push("bunq not configured — no payment links generated");
      } else if (missingLinks > 0) {
        notes.push(`${missingLinks} payment link(s) could not be created`);
      }

      setSplitWarnings(warnings);
      setFailedSends(newFailedSends);
      setLiveSplits(splitResult.splits as LiveSplit[]);
      setPollingActive(splitResult.bunq_available && splitResult.splits.some(s => !s.paid));
      if (notes.length > 0) {
        setErrorMessage(notes.join("; "));
      }
      setPhase("done");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not finalize split";
      setErrorMessage(message);
      setPhase("split");
    }
  };

  const handleRetry = async () => {
    if (retrying || failedSends.length === 0) return;
    setRetrying(true);
    const retryOutcomes = await Promise.allSettled(
      failedSends.map(s => api.sendWhatsapp({ phone_number: s.phone, message: s.message })),
    );
    const stillFailed: FailedSend[] = [];
    const newWarnings: string[] = [];
    retryOutcomes.forEach((outcome, idx) => {
      if (outcome.status === "rejected") {
        const s = failedSends[idx];
        const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        newWarnings.push(`${s.name}: ${reason}`);
        stillFailed.push(s);
      }
    });
    setFailedSends(stillFailed);
    setSplitWarnings(newWarnings);
    setRetrying(false);
  };

  // Poll receipt status while in done phase + at least one split is unpaid.
  // Stops automatically when all are paid, after 5 minutes, or when phase changes.
  useEffect(() => {
    if (phase !== "done" || !scanned || !pollingActive) return;

    let cancelled = false;
    const startedAt = Date.now();
    const MAX_DURATION_MS = 5 * 60 * 1000;
    const receiptId = scanned.id;

    const poll = async () => {
      try {
        const res = await api.getReceiptStatus(receiptId);
        if (cancelled) return;
        setLiveSplits(prev => {
          const byId = new Map(res.splits.map(s => [s.id, s]));
          return prev.map(p => {
            const fresh = byId.get(p.id);
            return fresh ? { ...p, ...fresh } : p;
          });
        });
        if (res.splits.length > 0 && res.splits.every(s => s.paid)) {
          setPollingActive(false);
        }
      } catch {
        // Soft-fail: keep polling, network blips are expected.
      }
    };

    const interval = window.setInterval(() => {
      if (Date.now() - startedAt > MAX_DURATION_MS) {
        setPollingActive(false);
        return;
      }
      void poll();
    }, 4000);

    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [phase, scanned, pollingActive]);

  const reset = () => {
    setSelected(null);
    setAllocations({});
    setScanned(null);
    setErrorMessage(null);
    setSplitWarnings([]);
    setFailedSends([]);
    setRetrying(false);
    setLiveSplits([]);
    setPollingActive(false);
    setBudgetToast(null);
    setPhase("start");
    onReceiptOpenChange(false);
  };

  const total = currentItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const anyAssigned = Object.values(allocations).some(m => totalAssigned(m) > 0);

  const friendTotals = friends
    .map(f => ({
      ...f,
      total: currentItems.reduce((sum, item) => {
        const alloc = allocations[item.id] ?? {};
        const shares = alloc[f.id] ?? 0;
        const totalShares = totalAssigned(alloc);
        if (totalShares === 0) return sum;
        return sum + (shares / totalShares) * (item.price * item.quantity);
      }, 0),
    }))
    .filter(f => f.total > 0);

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg,image/jpg,image/png,image/webp"
      capture="environment"
      onChange={handleFileSelected}
      className="hidden"
    />
  );

  const budgetToastUi = budgetToast && (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40"
      style={{ top: 18, width: "calc(100% - 24px)", maxWidth: 360 }}
    >
      <div
        className="rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5 shadow-lg"
        style={{
          background: theme.card,
          border: `1px solid ${budgetToast.status === "over" ? BRAND.red : BRAND.orange}66`,
        }}
      >
        <AlertTriangle
          size={16}
          strokeWidth={3}
          style={{ color: budgetToast.status === "over" ? BRAND.red : BRAND.orange, flexShrink: 0 }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black truncate" style={{ color: theme.text }}>
            {budgetToast.label} budget {budgetToast.status === "over" ? "exceeded" : "warning"}
          </p>
          <p className="text-[10px] font-semibold mt-0.5" style={{ color: theme.dim }}>
            {Math.round(budgetToast.pct)}% used this month
          </p>
        </div>
        <button onClick={() => setBudgetToast(null)} aria-label="Dismiss" className="p-0.5">
          <X size={14} style={{ color: theme.dim }} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );

  // ─── Phase gating ──────────────────────────────────────────────────────────

  if (phase === "start") {
    return (
      <div className="flex flex-col gap-4 pb-4">
        <ScanCTA onTap={startScan} />
        {hiddenInput}
        {budgetToastUi}
        {errorMessage && (
          <p className="mx-4 text-xs text-center font-semibold" style={{ color: BRAND.red }}>
            {errorMessage}
          </p>
        )}
      </div>
    );
  }

  if (phase === "camera") {
    return (
      <div className="flex flex-col gap-4 pb-4">
        <CameraFraming onCapture={captureReceipt} onCancel={reset} />
        {hiddenInput}
        {budgetToastUi}
      </div>
    );
  }

  if (phase === "scanning") {
    return (
      <div className="flex flex-col gap-4 pb-4">
        <ScanningLoader />
        {hiddenInput}
        {budgetToastUi}
      </div>
    );
  }

  if (phase === "done") {
    const paidCount = liveSplits.filter(s => s.paid).length;
    const totalCount = liveSplits.length;
    const allPaid = totalCount > 0 && paidCount === totalCount;
    const headerBg = splitWarnings.length > 0 ? BRAND.orange : (allPaid ? theme.brand : theme.brand);
    const headerTitle = splitWarnings.length > 0
      ? "Split done — some issues"
      : allPaid
        ? "All paid!"
        : "WhatsApp reminders sent!";
    const headerSubtitle = splitWarnings.length > 0
      ? `${friendTotals.length - splitWarnings.length} of ${friendTotals.length} notified`
      : totalCount > 0
        ? `${paidCount} of ${totalCount} paid`
        : `${friendTotals.length} friend${friendTotals.length === 1 ? "" : "s"} notified`;

    const renderRow = (f: typeof friendTotals[number]) => {
      const live = liveSplits.find(s => s.contact_id === f.id);
      const paid = !!live?.paid;
      const paymentUrl = live?.payment_url ?? null;
      return (
        <div
          key={f.id}
          className="flex items-center gap-3 rounded-2xl px-3 py-2 transition-all duration-500"
          style={{
            background: paid ? `${theme.brand}1A` : theme.cardHi,
            border: paid ? `1px solid ${theme.brand}55` : `1px solid transparent`,
          }}
        >
          <FriendAvatar f={f} size={32} fontSize={11} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>{f.name}</p>
            <span
              className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide transition-all duration-500"
              style={{
                background: paid ? theme.brand : `${theme.dim}22`,
                color: paid ? "#000" : theme.dim,
              }}
            >
              {paid ? <><Check size={10} strokeWidth={3} /> PAID</> : "PENDING"}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <p
              className="text-sm font-black transition-colors duration-500"
              style={{ color: paid ? theme.brand : theme.text, fontFamily: FONT_MONO }}
            >
              €{f.total.toFixed(2)}
            </p>
            {!paid && paymentUrl && (
              <a
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-bold underline"
                style={{ color: theme.dim }}
              >
                Open link
              </a>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="mx-4 mt-2 flex flex-col gap-3">
        <div
          className="rounded-3xl p-5 flex flex-col gap-4"
          style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-500"
              style={{ background: headerBg }}
            >
              <Check size={20} className="text-white" strokeWidth={3} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold" style={{ color: theme.text }}>
                {headerTitle}
              </p>
              <p className="text-xs mt-0.5" style={{ color: theme.dim }}>
                {headerSubtitle}
              </p>
            </div>
            {pollingActive && (
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-full"
                style={{ background: `${theme.brand}22`, border: `1px solid ${theme.brand}44` }}
              >
                <Loader2 size={11} className="animate-spin" style={{ color: theme.brand }} strokeWidth={3} />
                <span className="text-[9px] font-black tracking-wide" style={{ color: theme.brand }}>
                  LIVE BUNQ STATUS
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {friendTotals.map(renderRow)}
          </div>
        </div>
        {splitWarnings.length > 0 && (
          <div
            className="rounded-2xl px-4 py-3"
            style={{ background: `${BRAND.red}14`, border: `1px solid ${BRAND.red}33` }}
          >
            <p className="text-[11px] font-bold mb-1.5" style={{ color: BRAND.red }}>
              Delivery issues — please follow up:
            </p>
            {splitWarnings.map((w, i) => (
              <p key={i} className="text-[11px] font-medium" style={{ color: BRAND.red }}>{w}</p>
            ))}
          </div>
        )}
        {failedSends.length > 0 && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
            style={{ background: BRAND.orange, color: "#000" }}
          >
            {retrying
              ? <><Loader2 size={16} className="animate-spin" strokeWidth={3} /> Retrying…</>
              : `Retry ${failedSends.length} failed`
            }
          </button>
        )}
        <button
          onClick={reset}
          className="py-3.5 rounded-2xl text-sm font-bold"
          style={{ background: theme.card, color: theme.dim, border: `1px solid ${theme.border}` }}
        >
          New Receipt
        </button>
        {errorMessage && (
          <p className="text-xs text-center font-semibold" style={{ color: BRAND.red }}>
            {errorMessage}
          </p>
        )}
        {hiddenInput}
        {budgetToastUi}
      </div>
    );
  }

  // phase === "split" | "sending"
  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Back button */}
      <button
        onClick={reset}
        className="flex items-center gap-1.5 mx-4 mt-2 w-fit active:opacity-60 transition-opacity"
        aria-label="Back"
      >
        <ChevronRight
          size={16}
          strokeWidth={2.5}
          className="rotate-180"
          style={{ color: theme.dim }}
        />
        <span className="text-sm font-semibold" style={{ color: theme.dim, fontFamily: FONT_SANS }}>
          Back
        </span>
      </button>

        {/* Summary card */}
        <div
          className="mx-4 mt-2 rounded-3xl px-5 py-4"
          style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        >
          <p className="text-xs font-semibold" style={{ color: theme.dim }}>
            {(scanned?.merchant ?? "Receipt") + " · " + (scanned?.date ?? "Today")}
          </p>
          <p
            className="font-light mt-1"
            style={{
              color: theme.text,
              fontSize: 32,
              letterSpacing: "-0.02em",
              fontFamily: FONT_MONO,
            }}
          >
            €{total.toFixed(2)}
          </p>
        </div>

        {/* Receipt list */}
        <div
          className="mx-4 rounded-3xl overflow-hidden"
          style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        >
          {currentItems.map((item, idx) => {
            const alloc = allocations[item.id] ?? {};
            const isActive = selected === item.id;
            const assignedN = totalAssigned(alloc);
            const isLast = idx === currentItems.length - 1;
            const lineTotal = item.price * item.quantity;

            return (
              <div
                key={item.id}
                style={{ borderBottom: isLast ? "none" : `1px solid ${theme.border}` }}
              >
                <div
                  onClick={() => setSelected(isActive ? null : item.id)}
                  className="flex items-center px-4 py-3.5 cursor-pointer transition-all"
                  style={{ background: isActive ? theme.cardHi : "transparent" }}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 mr-3 transition-all"
                    style={{
                      background: assignedN > 0 ? theme.brand : theme.dimmer,
                      boxShadow: assignedN > 0 ? `0 0 6px ${theme.brand}99` : "none",
                    }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-sm font-semibold" style={{ color: theme.text }}>{item.name}</p>
                      {item.quantity > 1 && (
                        <span className="text-xs font-bold" style={{ color: theme.dim }}>
                          ×{item.quantity}
                        </span>
                      )}
                    </div>
                    {assignedN > 0 && (
                      <div className="flex items-center mt-1">
                        <div className="flex -space-x-1.5">
                          {Object.keys(alloc).map(fidStr => {
                            const f = friends.find(f => f.id === Number(fidStr));
                            if (!f) return null;
                            return (
                              <div
                                key={fidStr}
                                className="w-5 h-5 rounded-full flex items-center justify-center text-white"
                                style={{
                                  background: f.color,
                                  fontSize: 8,
                                  fontWeight: 800,
                                  border: `1.5px solid ${theme.card}`,
                                }}
                              >
                                {f.initials[0]}
                              </div>
                            );
                          })}
                        </div>
                        {(() => {
                          const weights = Object.values(alloc);
                          const allEqual = weights.every(w => w === weights[0]);
                          const perUnit = lineTotal / assignedN;
                          const label = allEqual
                            ? `€${perUnit.toFixed(2)} each`
                            : `€${perUnit.toFixed(2)} per unit`;
                          return (
                            <span
                              className="text-[11px] font-semibold ml-2"
                              style={{ color: theme.dim, fontFeatureSettings: "'tnum'", fontFamily: FONT_MONO }}
                            >
                              {label}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="text-right ml-2">
                    <p
                      className="text-sm font-bold"
                      style={{ color: theme.text, fontFeatureSettings: "'tnum'", fontFamily: FONT_MONO }}
                    >
                      €{lineTotal.toFixed(2)}
                    </p>
                  </div>
                  <ChevronRight
                    size={14}
                    className={`ml-2 flex-shrink-0 transition-transform ${isActive ? "rotate-90" : ""}`}
                    style={{ color: isActive ? theme.brand : theme.dimmer }}
                  />
                </div>

                {isActive && (
                  <div
                    className="px-4 pt-3 pb-4"
                    style={{ background: theme.bg, borderTop: `1px solid ${theme.border}` }}
                  >
                    <FriendSelector
                      allocation={alloc}
                      onAssign={handleAssign}
                      onManage={openManager}
                    />
                    {assignedN > 0 && (
                      <WeightSteppers
                        item={item}
                        allocation={alloc}
                        onBump={handleBump}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {errorMessage && (
          <p className="mx-4 text-xs text-center font-semibold" style={{ color: BRAND.red }}>
            {errorMessage}
          </p>
        )}

        {anyAssigned && (() => {
          const noPhone = friendTotals.filter(
            f => !f.phone || f.phone.startsWith('tmp-') || !isValidPhone(f.phone)
          );
          return (
            <div className="mx-4 flex flex-col gap-2">
              {noPhone.length > 0 && (
                <div
                  className="rounded-2xl px-4 py-3"
                  style={{ background: `${BRAND.orange}18`, border: `1px solid ${BRAND.orange}44` }}
                >
                  <p className="text-[11px] font-bold" style={{ color: BRAND.orange }}>
                    Won't receive WhatsApp (no valid phone):
                  </p>
                  {noPhone.map(f => (
                    <p key={f.id} className="text-[11px] font-medium mt-0.5" style={{ color: BRAND.orange }}>
                      · {f.name}
                    </p>
                  ))}
                </div>
              )}
              <button
                onClick={handleConfirm}
                disabled={phase === "sending"}
                className={`w-full py-4 rounded-2xl font-black text-base transition-all active:scale-95 flex items-center justify-center gap-2 ${phase === "sending" ? "opacity-80" : ""}`}
                style={{ background: theme.brand, color: "#000" }}
              >
                {phase === "sending" ? (
                  <><Loader2 size={18} className="animate-spin" strokeWidth={3} /> Sending reminders…</>
                ) : (
                  <>
                    <Check size={18} strokeWidth={3} />
                    Confirm Split
                  </>
                )}
              </button>
            </div>
          );
        })()}

        {hiddenInput}
        {budgetToastUi}
    </div>
  );
}

// ── Receipt detail modal ──────────────────────────────────────────────────────

function ReceiptDetailModal({ receipt, onClose }: { receipt: PastReceipt; onClose: () => void }) {
  const theme = useTheme();
  const { friends } = useFriends();

  return (
    <div
      className="fixed inset-0 z-50 backdrop-blur-sm flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="rounded-t-3xl w-full max-w-sm px-6 pt-4 pb-10 max-h-[85vh] overflow-y-auto"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="w-10 h-1 rounded-full mx-auto mb-5"
          style={{ background: theme.border }}
        />

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="min-w-0 pr-3">
            <p
              className="text-[10px] font-bold uppercase"
              style={{ color: theme.dim, letterSpacing: "0.18em" }}
            >
              {receipt.date}
            </p>
            <h3
              className="font-black tracking-tight mt-1 truncate"
              style={{ color: theme.text, fontSize: 26, letterSpacing: "-0.02em" }}
            >
              {receipt.merchant}
            </h3>
            <p
              className="font-light mt-2"
              style={{
                color: theme.text,
                fontSize: 28,
                letterSpacing: "-0.03em",
                fontFeatureSettings: "'tnum'", fontFamily: FONT_MONO,
              }}
            >
              €{receipt.total.toFixed(2)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: theme.cardHi }}
            aria-label="Close"
          >
            <X size={14} style={{ color: theme.dim }} strokeWidth={2.5} />
          </button>
        </div>

        {/* Per-person totals */}
        <p
          className="text-[10px] font-bold uppercase mb-3"
          style={{ color: theme.dimmer, letterSpacing: "0.22em" }}
        >
          Totals
        </p>
        <div className="flex flex-col gap-1.5 mb-6">
          {receipt.splits.map(s => {
            const f = friends.find(f => f.id === s.friendId);
            if (!f) return null;
            return (
              <div
                key={s.friendId}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                style={{ background: theme.cardHi }}
              >
                <FriendAvatar f={f} size={36} fontSize={12} />
                <p className="text-sm font-semibold flex-1" style={{ color: theme.text }}>
                  {f.name}
                </p>
                <p
                  className="font-black"
                  style={{
                    color: theme.text,
                    fontSize: 16,
                    letterSpacing: "-0.02em",
                    fontFeatureSettings: "'tnum'", fontFamily: FONT_MONO,
                  }}
                >
                  €{s.amount.toFixed(2)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Per-item breakdown */}
        <p
          className="text-[10px] font-bold uppercase mb-3"
          style={{ color: theme.dimmer, letterSpacing: "0.22em" }}
        >
          Items
        </p>
        <div className="flex flex-col gap-2">
          {receipt.items.map((item, i) => {
            const lineTotal = item.price * item.quantity;
            const perPerson = item.assignedTo.length > 0
              ? lineTotal / item.assignedTo.length
              : 0;
            return (
              <div
                key={i}
                className="rounded-2xl px-3.5 py-3"
                style={{ background: theme.cardHi }}
              >
                <div className="flex items-start mb-2">
                  <p
                    className="text-sm flex-1 font-semibold"
                    style={{ color: theme.text }}
                  >
                    {item.name}
                    {item.quantity > 1 && (
                      <span className="ml-1.5 font-semibold" style={{ color: theme.dim }}>
                        ×{item.quantity}
                      </span>
                    )}
                  </p>
                  <p
                    className="text-sm font-bold"
                    style={{
                      color: theme.text,
                      fontFeatureSettings: "'tnum'", fontFamily: FONT_MONO,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    €{lineTotal.toFixed(2)}
                  </p>
                </div>
                {item.assignedTo.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.assignedTo.map(fid => {
                      const f = friends.find(f => f.id === fid);
                      if (!f) return null;
                      return (
                        <div
                          key={fid}
                          className="flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5"
                          style={{ background: `${f.color}1F` }}
                        >
                          <FriendAvatar f={f} size={20} fontSize={8} />
                          <span
                            className="text-[11px] font-bold"
                            style={{
                              color: f.color,
                              fontFeatureSettings: "'tnum'", fontFamily: FONT_MONO,
                              letterSpacing: "-0.01em",
                            }}
                          >
                            €{perPerson.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Receipts screen ───────────────────────────────────────────────────────────

function apiReceiptToPast(r: ApiReceipt, friends: Friend[]): PastReceipt {
  const items: ReceiptLine[] = r.items.map(it => ({
    name: it.name,
    price: it.price,
    quantity: it.quantity,
    assignedTo: it.assigned_contact_ids,
  }));

  const splits: ReceiptSplit[] = (r.splits ?? []).map(s => ({
    friendId: s.contact_id,
    amount: s.amount,
  }));

  // If splits aren't included (list endpoint), derive from allocations as a fallback.
  let derivedSplits = splits;
  if (derivedSplits.length === 0) {
    const totals: Record<number, number> = {};
    items.forEach(line => {
      const lineTotal = line.price * line.quantity;
      const n = line.assignedTo.length;
      if (n === 0) return;
      const share = lineTotal / n;
      line.assignedTo.forEach(id => {
        totals[id] = (totals[id] ?? 0) + share;
      });
    });
    derivedSplits = Object.entries(totals).map(([id, amount]) => ({
      friendId: Number(id),
      amount: Math.round(amount * 100) / 100,
    }));
  }

  const splitCount = new Set(derivedSplits.map(s => s.friendId)).size;

  return {
    id: r.id,
    merchant: r.merchant ?? "Receipt",
    date: r.date ?? "",
    total: r.total,
    splitCount,
    splits: derivedSplits,
    items,
  };
}

function ReceiptsScreen() {
  const theme = useTheme();
  const { friends } = useFriends();
  const [openReceipt, setOpenReceipt] = useState<PastReceipt | null>(null);
  const [receipts, setReceipts] = useState<PastReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listReceipts()
      .then(({ data }) => setReceipts(data.map(r => apiReceiptToPast(r, friends))))
      .catch(err => {
        console.warn("Failed to load receipts", err);
        setReceipts([]);
      })
      .finally(() => setLoading(false));
  }, [friends]);

  const openDetail = async (r: PastReceipt) => {
    try {
      const { data } = await api.getReceipt(r.id);
      setOpenReceipt(apiReceiptToPast(data, friends));
    } catch (err) {
      console.warn("Failed to load receipt detail", err);
      setOpenReceipt(r);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4 pb-4">
        <div className="mx-4 mt-2">
          <p
            className="text-xs font-black uppercase tracking-widest mb-3"
            style={{ color: theme.dim }}
          >
            Past Receipts
          </p>
          <div
            className="rounded-3xl overflow-hidden"
            style={{ background: theme.card, border: `1px solid ${theme.border}` }}
          >
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin" style={{ color: theme.dim }} strokeWidth={2.5} />
              </div>
            )}
            {!loading && receipts.length === 0 && (
              <p className="text-sm text-center py-8 font-medium" style={{ color: theme.dim }}>
                No receipts yet. Scan one to get started.
              </p>
            )}
            {receipts.map((r, i) => (
              <button
                key={r.id}
                onClick={() => openDetail(r)}
                className="flex items-center px-4 py-3.5 w-full text-left active:opacity-80 transition-opacity"
                style={{
                  borderBottom:
                    i < receipts.length - 1 ? `1px solid ${theme.border}` : "none",
                  background: "transparent",
                }}
              >
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center mr-3"
                  style={{ background: `${theme.brand}22` }}
                >
                  <ReceiptText size={18} style={{ color: theme.brand }} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ color: theme.text }}>
                    {r.merchant}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: theme.dim }}>
                    {r.date}
                  </p>
                </div>
                <p
                  className="text-sm font-black mr-2"
                  style={{ color: theme.text, fontFeatureSettings: "'tnum'", fontFamily: FONT_MONO }}
                >
                  €{r.total.toFixed(2)}
                </p>
                <ChevronRight
                  size={14}
                  style={{ color: theme.dimmer }}
                  strokeWidth={2.5}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {openReceipt && (
        <ReceiptDetailModal
          receipt={openReceipt}
          onClose={() => setOpenReceipt(null)}
        />
      )}
    </>
  );
}

// ── Insights / AI Spending Coach ──────────────────────────────────────────────

function InsightsScreen() {
  const theme = useTheme();
  const [data, setData] = useState<ApiInsightsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState<{
    category: string;
    label: string;
    color: string;
    monthly_limit: number;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dash = await api.getInsightsDashboard();
      setData(dash);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4 pb-4 animate-pulse">
        <div className="mx-4 rounded-3xl p-5" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
          <div className="h-2.5 w-24 rounded-full mb-4" style={{ background: `${theme.dim}33` }} />
          <div className="h-10 w-40 rounded-xl" style={{ background: `${theme.dim}26` }} />
          <div className="h-2.5 w-36 rounded-full mt-3" style={{ background: `${theme.dim}22` }} />
        </div>
        <div className="mx-4 rounded-3xl p-5" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
          <div className="h-2.5 w-28 rounded-full mb-4" style={{ background: `${theme.dim}33` }} />
          <div className="flex items-center gap-5">
            <div className="w-[110px] h-[110px] rounded-full" style={{ background: `${theme.dim}22` }} />
            <div className="flex-1 flex flex-col gap-2">
              <div className="h-2.5 w-full rounded-full" style={{ background: `${theme.dim}24` }} />
              <div className="h-2.5 w-5/6 rounded-full" style={{ background: `${theme.dim}20` }} />
              <div className="h-2.5 w-2/3 rounded-full" style={{ background: `${theme.dim}18` }} />
            </div>
          </div>
        </div>
        <div className="mx-4 rounded-2xl px-4 py-3" style={{ background: `${theme.brand}10`, border: `1px solid ${theme.brand}22` }}>
          <div className="h-2.5 w-3/4 rounded-full" style={{ background: `${theme.dim}20` }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-4 mt-3 rounded-2xl px-4 py-3" style={{ background: `${BRAND.red}14`, border: `1px solid ${BRAND.red}33` }}>
        <p className="text-xs font-bold" style={{ color: BRAND.red }}>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const allCategoriesByKey: Record<string, ApiCategoryMeta> = {};
  data.categories.forEach(c => { allCategoriesByKey[c.key] = c; });

  const unBudgetedCategories = data.categories.filter(
    c => !data.budgets.some(b => b.category === c.key)
  );

  return (
    <>
      <div className="flex flex-col gap-4 pb-4">
        <MonthlyTotalCard data={data} theme={theme} />
        <CategoryDonut breakdown={data.breakdown} theme={theme} />
        {data.narratives.length > 0 && (
          <InsightCards narratives={data.narratives} theme={theme} />
        )}
        <BudgetList
          budgets={data.budgets}
          theme={theme}
          onEdit={(b) => setEditingBudget({
            category: b.category,
            label: b.label,
            color: b.color,
            monthly_limit: b.limit,
          })}
        />
        {unBudgetedCategories.length > 0 && (
          <div className="mx-4">
            <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: theme.dim }}>
              Add a budget
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {unBudgetedCategories.map(c => (
                <button
                  key={c.key}
                  onClick={() => setEditingBudget({ category: c.key, label: c.label, color: c.color, monthly_limit: 100 })}
                  className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
                  style={{ background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}55` }}
                >
                  <Plus size={12} strokeWidth={3} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {editingBudget && (
        <BudgetEditorSheet
          category={editingBudget.category}
          label={editingBudget.label}
          color={editingBudget.color}
          initialLimit={editingBudget.monthly_limit}
          onClose={() => setEditingBudget(null)}
          onSaved={() => {
            setEditingBudget(null);
            void refresh();
          }}
          existingId={data.budgets.find(b => b.category === editingBudget.category)?.id}
        />
      )}
    </>
  );
}

function MonthlyTotalCard({ data, theme }: { data: ApiInsightsDashboard; theme: typeof DARK }) {
  const delta = data.month_delta_pct;
  const deltaColor = delta == null
    ? theme.dim
    : delta > 0
      ? BRAND.red
      : BRAND.green;
  const DeltaIcon = delta == null
    ? null
    : delta > 0
      ? TrendingUp
      : TrendingDown;

  return (
    <div
      className="mx-4 rounded-3xl p-5"
      style={{ background: theme.card, border: `1px solid ${theme.border}` }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: theme.dim }}>
          This month
        </p>
        <BarChart3 size={14} style={{ color: theme.dim }} strokeWidth={2.5} />
      </div>
      <p
        className="font-light mt-2"
        style={{
          color: theme.text,
          fontSize: 40,
          letterSpacing: "-0.02em",
          fontFamily: FONT_MONO,
        }}
      >
        €{data.month_total.toFixed(2)}
      </p>
      {delta != null && DeltaIcon && (
        <div className="flex items-center gap-1.5 mt-1">
          <DeltaIcon size={12} style={{ color: deltaColor }} strokeWidth={3} />
          <span className="text-xs font-black" style={{ color: deltaColor }}>
            {delta > 0 ? "+" : ""}{delta}%
          </span>
          <span className="text-xs font-medium" style={{ color: theme.dim }}>
            vs last month (€{data.previous_month_total.toFixed(2)})
          </span>
        </div>
      )}
    </div>
  );
}

function CategoryDonut({ breakdown, theme }: { breakdown: ApiBreakdownRow[]; theme: typeof DARK }) {
  if (breakdown.length === 0) {
    return (
      <div
        className="mx-4 rounded-3xl p-5 text-center"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
      >
        <p className="text-xs font-medium" style={{ color: theme.dim }}>
          No spending insights yet. Scan your first receipt to unlock category intelligence.
        </p>
      </div>
    );
  }

  const total = breakdown.reduce((s, r) => s + r.total, 0);
  let acc = 0;
  const stops: string[] = breakdown.map(r => {
    const start = (acc / total) * 360;
    acc += r.total;
    const end = (acc / total) * 360;
    return `${r.color} ${start}deg ${end}deg`;
  });
  const conic = `conic-gradient(${stops.join(", ")})`;

  return (
    <div
      className="mx-4 rounded-3xl p-5"
      style={{ background: theme.card, border: `1px solid ${theme.border}` }}
    >
      <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: theme.dim }}>
        Spend by category
      </p>
      <div className="flex items-center gap-5">
        <div className="flex-shrink-0" style={{ width: 110, height: 110 }}>
          <div
            className="rounded-full"
            style={{ width: 110, height: 110, background: conic }}
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {breakdown.slice(0, 5).map(row => {
            const pct = total > 0 ? Math.round((row.total / total) * 100) : 0;
            return (
              <div key={row.category} className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: row.color }}
                />
                <p className="text-xs font-bold flex-1 truncate" style={{ color: theme.text }}>
                  {row.label}
                </p>
                <p className="text-xs font-black" style={{ color: theme.dim, fontFamily: FONT_MONO }}>
                  €{row.total.toFixed(0)} · {pct}%
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InsightCards({ narratives, theme }: { narratives: string[]; theme: typeof DARK }) {
  return (
    <div className="mx-4 flex flex-col gap-2">
      {narratives.map((text, i) => (
        <div
          key={i}
          className="rounded-2xl px-4 py-3 flex items-start gap-2.5"
          style={{
            background: `${theme.brand}10`,
            border: `1px solid ${theme.brand}33`,
          }}
        >
          <Sparkles size={14} style={{ color: theme.brand, marginTop: 2 }} strokeWidth={2.5} />
          <p className="text-xs font-semibold leading-snug" style={{ color: theme.text }}>
            {text}
          </p>
        </div>
      ))}
    </div>
  );
}

function BudgetList({
  budgets, theme, onEdit,
}: {
  budgets: ApiBudgetStatus[];
  theme: typeof DARK;
  onEdit: (b: ApiBudgetStatus) => void;
}) {
  if (budgets.length === 0) {
    return (
      <div className="mx-4">
        <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: theme.dim }}>
          Budgets
        </p>
        <div
          className="rounded-2xl px-4 py-3 text-center"
          style={{ background: theme.card, border: `1px dashed ${theme.border}` }}
        >
          <p className="text-xs font-medium" style={{ color: theme.dim }}>
            No budgets yet — set one below to get warnings before you overspend.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: theme.dim }}>
          Budgets
        </p>
        <Target size={12} style={{ color: theme.dim }} strokeWidth={2.5} />
      </div>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
      >
        {budgets.map((b, i) => {
          const pct = Math.min(100, b.pct_used);
          const fill = b.status === "over" ? BRAND.red : b.status === "warning" ? BRAND.orange : b.color;
          return (
            <button
              key={b.id}
              onClick={() => onEdit(b)}
              className="w-full text-left px-4 py-3 active:opacity-80"
              style={{
                borderBottom: i < budgets.length - 1 ? `1px solid ${theme.border}` : "none",
              }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.color }} />
                <p className="text-sm font-bold flex-1" style={{ color: theme.text }}>{b.label}</p>
                {b.status !== "ok" && (
                  <AlertTriangle size={12} style={{ color: fill }} strokeWidth={3} />
                )}
                <p className="text-xs font-black" style={{ color: theme.text, fontFamily: FONT_MONO }}>
                  €{b.spent.toFixed(0)} <span style={{ color: theme.dim }}>/ €{b.limit.toFixed(0)}</span>
                </p>
              </div>
              <div
                className="mt-2 h-1.5 rounded-full overflow-hidden"
                style={{ background: `${theme.dim}22` }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: fill }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BudgetEditorSheet({
  category, label, color, initialLimit, onClose, onSaved, existingId,
}: {
  category: string;
  label: string;
  color: string;
  initialLimit: number;
  onClose: () => void;
  onSaved: () => void;
  existingId?: number;
}) {
  const theme = useTheme();
  const [limit, setLimit] = useState(initialLimit);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.upsertBudget({ category, monthly_limit: Math.max(0, Math.round(limit)) });
      onSaved();
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existingId) return;
    setSaving(true);
    setErr(null);
    try {
      await api.deleteBudget(existingId);
      onSaved();
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : "Could not delete");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl p-5 flex flex-col gap-4"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: color }} />
            <p className="text-base font-black" style={{ color: theme.text }}>
              {label} budget
            </p>
          </div>
          <button onClick={onClose} className="p-1" aria-label="Close">
            <X size={18} style={{ color: theme.dim }} strokeWidth={2.5} />
          </button>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: theme.dim }}>
            Monthly limit
          </p>
          <p
            className="font-light mt-1"
            style={{ color: theme.text, fontSize: 32, fontFamily: FONT_MONO, letterSpacing: "-0.02em" }}
          >
            €{Math.round(limit)}
          </p>
          <input
            type="range"
            min={0}
            max={500}
            step={5}
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="w-full mt-2"
            style={{ accentColor: color }}
          />
          <div className="flex justify-between text-[10px] font-bold mt-1" style={{ color: theme.dim }}>
            <span>€0</span>
            <span>€500</span>
          </div>
        </div>

        {err && (
          <p className="text-xs font-bold" style={{ color: BRAND.red }}>{err}</p>
        )}

        <div className="flex gap-2">
          {existingId && (
            <button
              onClick={remove}
              disabled={saving}
              className="flex-1 py-3 rounded-2xl font-black text-sm disabled:opacity-60"
              style={{ background: theme.cardHi, color: BRAND.red, border: `1px solid ${theme.border}` }}
            >
              Remove
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl font-black text-sm disabled:opacity-60"
            style={{ background: theme.brand, color: "#000" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Credits modal ─────────────────────────────────────────────────────────────

function CreditsModal({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const { friends } = useFriends();
  const creators = [
    { name: "Bilal Noah Kerkeni",       linkedin: "https://www.linkedin.com/in/kerkeni/",                              avatar: "/avatars/bilal.jpg" },
    { name: "Charalampos Efthymiadis",  linkedin: "https://www.linkedin.com/in/charalampos-efthymiadis-181831251/",    avatar: "/avatars/charalampos.jpg" },
    { name: "Eesti Raud",               linkedin: "https://www.linkedin.com/in/eesti-raud-8b5b45389/",                 avatar: "/avatars/eesti.jpg" },
    { name: "Josef Pulkrábek",          linkedin: "https://www.linkedin.com/in/josef-pulkr%C3%A1bek-638a433a3/",      avatar: "/avatars/josef.jpg" },
  ];
  return (
    <div
      className="fixed inset-0 z-50 backdrop-blur-sm flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="rounded-t-3xl w-full max-w-sm px-6 pt-4 pb-12"
        style={{ background: theme.card, border: `1px solid ${theme.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="w-10 h-1 rounded-full mx-auto mb-5"
          style={{ background: theme.border }}
        />
        <div className="flex items-start justify-between mb-5">
          <div>
            <span
              className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full"
              style={{ background: "#FFFFFF" }}
            >
              <BunqMark size={11} />
              <span>Tally</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: theme.cardHi }}
          >
            <X size={14} style={{ color: theme.dim }} />
          </button>
        </div>
        <p className="text-sm leading-relaxed mb-5" style={{ color: theme.dim }}>
          AI-powered smart bill splitting. Scan receipts, assign items, and send splits via WhatsApp instantly.
        </p>
        <p
          className="text-xs font-black uppercase tracking-widest mb-3"
          style={{ color: theme.dimmer }}
        >
          Made with ♥ by
        </p>
        <div className="flex flex-col gap-2.5">
          {creators.map(({ name, linkedin, avatar }) => {
            return (
              <a key={name} href={linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:opacity-75 transition-opacity">
                <div
                  className="w-9 h-9 rounded-full shrink-0 overflow-hidden relative"
                  style={{ background: "#000" }}
                >
                  <img
                    src={avatar}
                    alt={name}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                <p className="text-sm font-semibold" style={{ color: theme.text }}>{name}</p>
              </a>
            );
          })}
        </div>
      
      </div>
    </div>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────

function contactToFriend(c: ApiContact, fallbackColor: string): Friend {
  return {
    id: c.id,
    name: c.name,
    color: c.color ?? fallbackColor,
    initials: c.initials ?? getInitials(c.name),
    phone: c.phone_number ?? undefined,
    profilePic: c.whatsapp_profile_pic,
  };
}

function FriendAvatar({ f, size = 36, fontSize = 12 }: { f: Friend; size?: number; fontSize?: number }) {
  if (f.profilePic) {
    return (
      <img
        src={f.profilePic}
        alt={f.name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: f.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize,
        fontWeight: 900,
        flexShrink: 0,
        fontFamily: FONT_HEAD,
      }}
    >
      {f.initials}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<"tally" | "receipts" | "insights">("tally");
  const [showCredits, setShowCredits] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [friends, setFriends] = useState<Friend[]>([]);
  const theme = isDark ? DARK : LIGHT;

  useEffect(() => {
    api
      .listContacts()
      .then(({ data }) => {
        setFriends(
          data.map((c, i) => contactToFriend(c, COLOR_PALETTE[i % COLOR_PALETTE.length]))
        );
      })
      .catch(err => console.warn("Failed to load contacts", err));
  }, []);

  const changeTab = (id: "tally" | "receipts" | "insights") => {
    setTab(id);
    setReceiptOpen(false);
  };

  const fetchAndStoreProfilePic = useCallback(async (contactId: number, phone: string, color: string) => {
    if (!phone || phone.startsWith("tmp-")) return;
    try {
      const { url } = await api.getWhatsappProfilePic(phone);
      if (!url) return;
      const { data } = await api.updateContact(contactId, { whatsapp_profile_pic: url });
      setFriends(prev => prev.map(f => f.id === contactId ? contactToFriend(data, color) : f));
    } catch {
      // profile pic is optional — silently skip
    }
  }, []);

  const addFriend = useCallback(
    async (name: string, color: string, phone?: string) => {
      try {
        const phoneVal = phone && phone.trim() !== "" ? phone.trim() : `tmp-${Date.now()}`;
        const { data } = await api.createContact({ name, color, phone_number: phoneVal });
        setFriends(prev => [...prev, contactToFriend(data, color)]);
        fetchAndStoreProfilePic(data.id, phoneVal, color);
      } catch (err) {
        if (err instanceof ApiError) {
          alert(`Could not add contact: ${err.message}`);
        } else {
          throw err;
        }
      }
    },
    [fetchAndStoreProfilePic]
  );

  const updateFriend = useCallback(
    async (
      id: number,
      updates: Partial<Pick<Friend, "name" | "color" | "phone">>
    ) => {
      try {
        const payload: Record<string, unknown> = {};
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.color !== undefined) payload.color = updates.color;
        if (updates.phone !== undefined) payload.phone_number = updates.phone;

        const { data } = await api.updateContact(id, payload);
        const color = updates.color ?? (friends.find(f => f.id === id)?.color ?? BRAND.green);
        setFriends(prev => prev.map(f => (f.id === id ? contactToFriend(data, color) : f)));

        if (updates.phone) {
          fetchAndStoreProfilePic(id, updates.phone, color);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          alert(`Could not update contact: ${err.message}`);
        } else {
          throw err;
        }
      }
    },
    [friends, fetchAndStoreProfilePic]
  );

  const deleteFriend = useCallback(async (id: number) => {
    try {
      await api.deleteContact(id);
      setFriends(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      if (err instanceof ApiError) {
        alert(`Could not delete contact: ${err.message}`);
      } else {
        throw err;
      }
    }
  }, []);

  const friendsValue: FriendsCtxValue = {
    friends,
    addFriend,
    updateFriend,
    deleteFriend,
    openManager: () => setShowContacts(true),
  };

  const tabs = [
    { id: "tally",    label: "Tally",    icon: Users },
    { id: "receipts", label: "Receipts", icon: Clock },
    { id: "insights", label: "Insights", icon: BarChart3 },
  ] as const;

  return (
    <ThemeCtx.Provider value={theme}>
      <FriendsCtx.Provider value={friendsValue}>
        <div
          className="min-h-screen flex justify-center transition-colors"
          style={{ background: theme.bg }}
        >
          <div className="w-full max-w-sm flex flex-col min-h-screen relative">

            {/* Header */}
            <div
              className="sticky top-0 z-20 backdrop-blur-xl transition-colors"
              style={{
                background: isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.8)",
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <div className="flex items-center justify-between px-5 pt-10 pb-4">
                <div className="flex items-baseline gap-2">
                  <BunqMark size={26} />
                  <p
                    className="text-2xl font-black tracking-tight"
                    style={{ color: theme.text, fontFamily: FONT_HEAD }}
                  >
                    {tab === "insights" ? "Insights" : tab === "receipts" ? "Receipts" : "Tally"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsDark(d => !d)}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: theme.card, border: `1px solid ${theme.border}` }}
                    aria-label="Toggle theme"
                  >
                    {isDark
                      ? <Sun size={16} style={{ color: theme.dim }} strokeWidth={2.5} />
                      : <Moon size={16} style={{ color: theme.dim }} strokeWidth={2.5} />}
                  </button>
                  <button
                    onClick={() => setShowCredits(true)}
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: theme.card, border: `1px solid ${theme.border}` }}
                  >
                    <Info size={16} style={{ color: theme.dim }} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto pt-3 pb-28">
              {tab === "tally"    && <TallyScreen onReceiptOpenChange={setReceiptOpen} />}
              {tab === "receipts" && <ReceiptsScreen />}
              {tab === "insights" && <InsightsScreen />}
            </div>

            {/* Floating bottom layer: nav pill + add-contact FAB */}
            <div className="fixed bottom-6 inset-x-0 z-30 pointer-events-none flex justify-center">
              <div className="w-full max-w-sm relative flex justify-center">
                {/* Nav pill (centered) */}
                <div
                  className="pointer-events-auto flex rounded-full px-2 py-2 gap-1"
                  style={{
                    background: theme.card,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  {tabs.map(({ id, label, icon: Icon }) => {
                    const active = tab === id;
                    return (
                      <button
                        key={id}
                        onClick={() => changeTab(id)}
                        className="flex flex-col items-center gap-0.5 px-3 pt-1 pb-0.5 transition-opacity"
                        aria-label={label}
                      >
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                          style={{
                            background: active ? theme.brand : "transparent",
                          }}
                        >
                          <Icon
                            size={19}
                            strokeWidth={2.5}
                            color={active ? "#FFFFFF" : theme.dim}
                          />
                        </div>
                        <span
                          className="text-[10px] font-bold"
                          style={{
                            color: active ? theme.text : theme.dim,
                            letterSpacing: "0.02em",
                          }}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Add-contact FAB — only on Tally tab and not while a receipt is open */}
                {!receiptOpen && tab === "tally" && (
                  <button
                    onClick={() => setShowContacts(true)}
                    className="pointer-events-auto absolute right-4 bottom-1 w-12 h-12 rounded-full flex items-center justify-center transition-transform active:scale-95"
                    style={{
                      background: theme.brand,
                      boxShadow: isDark
                        ? "0 6px 20px rgba(0,0,0,0.5)"
                        : "0 6px 20px rgba(0,0,0,0.18)",
                    }}
                    aria-label="Add contact"
                  >
                    <Plus size={22} className="text-white" strokeWidth={3} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {showCredits && <CreditsModal onClose={() => setShowCredits(false)} />}
          {showContacts && <ContactsManager onClose={() => setShowContacts(false)} />}
        </div>
      </FriendsCtx.Provider>
    </ThemeCtx.Provider>
  );
}
