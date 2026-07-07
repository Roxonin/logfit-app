import React, { useState, useEffect, useCallback } from "react";
import {
  Dumbbell, ChevronLeft, Star, Plus, Trash2, X,
  Check, Users, History as HistoryIcon, PersonStanding,
  Delete, ChevronRight, Pencil, Settings, Copy, ClipboardCheck,
  FileDown, Trophy
} from "lucide-react";
import * as db from "./lib/db";

/* ------------------------------------------------------------------ */
/*  テーマ (色・不透明度は全てここで管理し、インラインstyleで適用する)      */
/* ------------------------------------------------------------------ */

const C = {
  bg: "#111417",
  panel: "rgba(255,255,255,0.04)",
  panelSoft: "rgba(255,255,255,0.03)",
  panelHover: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.10)",
  text: "#EDEDED",
  dim1: "rgba(237,237,237,0.70)",
  dim2: "rgba(237,237,237,0.50)",
  dim3: "rgba(237,237,237,0.40)",
  dim4: "rgba(237,237,237,0.30)",
  dim5: "rgba(237,237,237,0.22)",
  sheet: "#1B1F23",
  dark: "#101214",
  weight: "#F2A93B",
  aerobic: "#3DD6C6",
  danger: "#E5675A",
};

const DEFAULT_AEROBIC_EXERCISES = [
  "ランニング", "ウォーキング", "サイクリング", "エアロバイク",
  "ローイング", "エリプティカル", "水泳", "縄跳び",
];

const BODY_PARTS = ["胸", "肩", "背中", "腕", "腹", "脚"];

const DEFAULT_WEIGHT_EXERCISES = {
  胸: ["ベンチプレス", "インクラインベンチプレス", "ダンベルフライ", "チェストプレス", "プッシュアップ"],
  肩: ["ショルダープレス", "サイドレイズ", "リアレイズ", "アップライトロウ"],
  背中: ["ラットプルダウン", "デッドリフト", "ベントオーバーロウ", "チンニング", "シーテッドロウ"],
  腕: ["アームカール", "トライセプスエクステンション", "ハンマーカール", "ディップス"],
  腹: ["クランチ", "レッグレイズ", "プランク", "アブローラー"],
  脚: ["スクワット", "レッグプレス", "レッグエクステンション", "レッグカール", "ランジ", "カーフレイズ"],
};

const ACCENT = { aerobic: C.aerobic, weight: C.weight };

/* ------------------------------------------------------------------ */
/*  種目データのヘルパー (標準種目 + カスタム種目を合成する)                */
/* ------------------------------------------------------------------ */

function weightOptionsFor(bodyPart, customExercises) {
  const custom = customExercises.weight.filter((c) => c.bodyPart === bodyPart).map((c) => c.name);
  return [...(DEFAULT_WEIGHT_EXERCISES[bodyPart] || []), ...custom];
}
function weightGroups(customExercises) {
  return BODY_PARTS.map((part) => ({ label: part, options: weightOptionsFor(part, customExercises) }));
}
function exerciseToPartMap(customExercises) {
  const map = {};
  BODY_PARTS.forEach((part) => (DEFAULT_WEIGHT_EXERCISES[part] || []).forEach((n) => (map[n] = part)));
  customExercises.weight.forEach((c) => (map[c.name] = c.bodyPart));
  return map;
}
function aerobicOptions(customExercises) {
  return [...DEFAULT_AEROBIC_EXERCISES, ...customExercises.aerobic.map((c) => c.name)];
}

/* ------------------------------------------------------------------ */
/*  Google Healthのコーチなどに貼り付けるためのテキストレポート生成          */
/* ------------------------------------------------------------------ */

function formatDateJP(dateStr) {
  return new Date(dateStr).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

function buildReportText(session) {
  const weightEntries = session.entries.filter((e) => e.type === "weight");
  const aerobicEntries = session.entries.filter((e) => e.type === "aerobic");
  const lines = [];
  lines.push(`【トレーニング記録】${formatDateJP(session.date)}`);
  lines.push("");
  if (weightEntries.length) {
    lines.push("■ウェイトトレーニング");
    weightEntries.forEach((e) => {
      lines.push(`・${e.name}(${e.bodyPart}) ${e.machine ? "マシン" : "フリーウェイト"} ${e.weight}kg × ${e.reps}回 × ${e.sets}set`);
    });
    lines.push("");
  }
  if (aerobicEntries.length) {
    lines.push("■有酸素運動");
    aerobicEntries.forEach((e) => {
      lines.push(`・${e.name} ${e.machine ? "マシン" : "マシン無し"} ${e.duration}分 / ${e.distance}km / ${e.calories}kcal`);
    });
    lines.push("");
  }
  lines.push(`自己評価: ${"★".repeat(session.rating)}${"☆".repeat(5 - session.rating)}（5段階）`);
  if (session.note) lines.push(`メモ: ${session.note}`);
  return lines.join("\n");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  CSV一括出力                                                         */
/* ------------------------------------------------------------------ */

function csvEscape(val) {
  const str = String(val ?? "");
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function buildCSV(sessions) {
  const header = ["日付", "種類", "種目", "部位", "マシン/フリー", "重さ(kg)", "レップ", "セット", "時間(分)", "距離(km)", "カロリー(kcal)", "自己評価", "メモ"];
  const rows = [header];
  [...sessions]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((s) => {
      const dateStr = new Date(s.date).toLocaleDateString("ja-JP");
      if (s.entries.length === 0) {
        rows.push([dateStr, "", "", "", "", "", "", "", "", "", "", s.rating, s.note || ""]);
        return;
      }
      s.entries.forEach((e) => {
        if (e.type === "weight") {
          rows.push([dateStr, "ウェイト", e.name, e.bodyPart, e.machine ? "マシン" : "フリー", e.weight, e.reps, e.sets, "", "", "", s.rating, s.note || ""]);
        } else {
          rows.push([dateStr, "有酸素", e.name, "", e.machine ? "マシン" : "マシン無し", "", "", "", e.duration, e.distance, e.calories, s.rating, s.note || ""]);
        }
      });
    });
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

function downloadCSV(sessions, user) {
  const csv = buildCSV(sessions);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `training-log-${user}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filterSessionsByDate(sessions, from, to) {
  if (!from && !to) return sessions;
  return sessions.filter((s) => {
    const d = new Date(s.date);
    if (from && d < new Date(`${from}T00:00:00`)) return false;
    if (to && d > new Date(`${to}T23:59:59`)) return false;
    return true;
  });
}

/* ------------------------------------------------------------------ */
/*  日付入力(input type=date)⇔ISO日時の変換ヘルパー                     */
/* ------------------------------------------------------------------ */

function toDateInputValue(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromDateInputValue(str) {
  return new Date(`${str}T12:00:00`).toISOString();
}

/* ------------------------------------------------------------------ */
/*  月間ランキング用の集計                                               */
/* ------------------------------------------------------------------ */

function monthlyWeightVolume(sessions) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  let total = 0;
  (sessions || []).forEach((s) => {
    const d = new Date(s.date);
    if (d.getFullYear() === y && d.getMonth() === m) {
      s.entries.forEach((e) => {
        if (e.type === "weight") {
          total += (Number(e.weight) || 0) * (Number(e.reps) || 0) * (Number(e.sets) || 0);
        }
      });
    }
  });
  return total;
}

/* ------------------------------------------------------------------ */
/*  共通 UI 部品                                                        */
/* ------------------------------------------------------------------ */

function TopBar({ title, onBack, accent, onClose }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-4 sticky top-0 z-20"
      style={{ borderBottom: `1px solid ${C.border}`, backgroundColor: C.bg }}
    >
      {onBack ? (
        <button onClick={onBack} className="p-1 -ml-1" style={{ color: C.dim1, background: "none", border: "none" }}>
          <ChevronLeft size={26} />
        </button>
      ) : (
        <div style={{ width: 24 }} />
      )}
      <h1
        className="flex-1 text-center font-bold"
        style={{ fontSize: 17, color: accent || C.text, paddingRight: onClose ? 0 : 24, letterSpacing: 0.3 }}
      >
        {title}
      </h1>
      {onClose ? (
        <button onClick={onClose} className="p-1" style={{ color: C.dim2, background: "none", border: "none" }}>
          <X size={22} />
        </button>
      ) : (
        <div style={{ width: 24 }} />
      )}
    </div>
  );
}

function BigButton({ children, onClick, color = C.weight, variant = "solid", disabled, icon: Icon, iconSpin }) {
  const style =
    variant === "solid"
      ? { backgroundColor: disabled ? "rgba(255,255,255,0.08)" : color, color: disabled ? C.dim4 : C.dark, border: "none" }
      : { border: `2px solid ${color}`, color, backgroundColor: "transparent" };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-2xl py-4 px-5 flex items-center justify-center gap-2 font-bold transition"
      style={{ ...style, fontSize: 16 }}
    >
      {Icon && <Icon size={19} className={iconSpin ? "animate-spin" : undefined} />}
      {children}
    </button>
  );
}

/* 数字入力ボトムシート(テンキー) */
function NumberPad({ label, unit, initial, allowDecimal, decimalPlaces, onConfirm, onClose }) {
  const [val, setVal] = useState(initial != null && initial !== 0 ? String(initial) : "");

  const press = (d) => {
    if (d === ".") {
      if (!allowDecimal || val.includes(".")) return;
    } else if (allowDecimal && decimalPlaces != null && val.includes(".")) {
      const afterDot = val.split(".")[1] || "";
      if (afterDot.length >= decimalPlaces) return;
    }
    if (val.length >= 6) return;
    setVal((v) => (v === "0" && d !== "." ? d : v + d));
  };
  const backspace = () => setVal((v) => v.slice(0, -1));
  const clear = () => setVal("");

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onClose} />
      <div
        className="relative w-full rounded-t-3xl px-5 pt-5 pb-8"
        style={{ backgroundColor: C.sheet, animation: "slideUp .18s ease-out" }}
      >
        <div className="flex justify-between items-center mb-4">
          <span style={{ color: C.dim3, fontSize: 14 }}>{label}</span>
          <button onClick={onClose} className="p-1" style={{ color: C.dim4, background: "none", border: "none" }}>
            <X size={20} />
          </button>
        </div>
        <div className="text-center mb-6">
          <span style={{ fontSize: 48, fontWeight: 900, color: C.text }} className="tabular-nums">{val || "0"}</span>
          <span style={{ fontSize: 18, color: C.dim3, marginLeft: 8 }}>{unit}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              className="py-4 rounded-xl font-semibold"
              style={{ backgroundColor: C.panelHover, color: C.text, fontSize: 24, border: "none" }}
            >
              {d}
            </button>
          ))}
          <button onClick={clear} className="py-4 rounded-xl font-semibold" style={{ backgroundColor: C.panelHover, color: C.dim2, fontSize: 13, border: "none" }}>
            クリア
          </button>
          <button onClick={() => press("0")} className="py-4 rounded-xl font-semibold" style={{ backgroundColor: C.panelHover, color: C.text, fontSize: 24, border: "none" }}>
            0
          </button>
          <button onClick={backspace} className="py-4 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.panelHover, color: C.dim2, border: "none" }}>
            <Delete size={20} />
          </button>
        </div>
        <BigButton color={C.weight} onClick={() => onConfirm(val === "" ? 0 : Number(val))}>
          次へ
        </BigButton>
      </div>
    </div>
  );
}

/* 数値フィールドの表示ボックス(タップで開くだけ。開閉はEntryFormが一括管理) */
function FieldBox({ label, unit, value, onOpen, active }) {
  return (
    <button
      onClick={onOpen}
      className="flex-1 rounded-xl py-3 px-3 text-left"
      style={{ backgroundColor: C.panelHover, border: active ? `2px solid ${C.weight}` : "2px solid transparent" }}
    >
      <div style={{ fontSize: 11, color: C.dim4, marginBottom: 2 }}>{label}</div>
      <div className="tabular-nums" style={{ fontSize: 20, fontWeight: 700, color: value ? C.text : C.dim5 }}>
        {value || 0}
        <span style={{ fontSize: 12, color: C.dim3, marginLeft: 4 }}>{unit}</span>
      </div>
    </button>
  );
}

function PillToggle({ options, value, onChange, color }) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className="flex-1 py-2.5 rounded-xl font-bold transition"
          style={
            value === o.value
              ? { backgroundColor: color, color: C.dark, fontSize: 14, border: "none" }
              : { backgroundColor: C.panelHover, color: C.dim2, fontSize: 14, border: "none" }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* 種目選択(標準+カスタムを合成。グループ表示にも対応、自由入力も可能) */
function ExercisePicker({ options, groups, value, onChange, placeholder }) {
  const flat = groups ? groups.flatMap((g) => g.options) : options;
  const [custom, setCustom] = useState(!!(value && !flat.includes(value)));

  useEffect(() => {
    setCustom(!!(value && !flat.includes(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {!custom ? (
        <select
          value={flat.includes(value) ? value : ""}
          onChange={(e) => {
            if (e.target.value === "__custom__") { setCustom(true); onChange(""); }
            else onChange(e.target.value);
          }}
          className="w-full rounded-xl py-3 px-3 font-semibold"
          style={{ backgroundColor: C.panelHover, color: C.text, fontSize: 15, border: "none", colorScheme: "light" }}
        >
          <option value="" disabled style={{ color: "#111" }}>{placeholder}</option>
          {groups
            ? groups.map((g) => (
                <optgroup label={g.label} key={g.label}>
                  {g.options.map((o) => (
                    <option key={o} value={o} style={{ color: "#111" }}>{o}</option>
                  ))}
                </optgroup>
              ))
            : options.map((o) => (
                <option key={o} value={o} style={{ color: "#111" }}>{o}</option>
              ))}
          <option value="__custom__" style={{ color: "#111" }}>✏️ 自由入力(新しい種目)...</option>
        </select>
      ) : (
        <div className="flex gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="種目名を入力"
            className="flex-1 rounded-xl py-3 px-3 font-semibold"
            style={{ backgroundColor: C.panelHover, color: C.text, fontSize: 15, border: "none", outline: "none" }}
          />
          <button
            onClick={() => { setCustom(false); onChange(""); }}
            className="px-3 rounded-xl"
            style={{ backgroundColor: C.panelHover, color: C.dim3, fontSize: 12, border: "none" }}
          >
            一覧
          </button>
        </div>
      )}
      <p style={{ fontSize: 10.5, color: C.dim5, marginTop: 4 }}>
        自由入力した種目は保存時に一覧へ追加され、次回から選べるようになります
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  種目の入力フォーム (新規追加 / 編集の両方に対応)                       */
/* ------------------------------------------------------------------ */

function EntryForm({ type, initial, mode = "add", customExercises, onRegisterExercise, onSave, onDelete, onCancel }) {
  const [machine, setMachine] = useState(initial?.machine ?? true);
  const [name, setName] = useState(initial?.name ?? "");
  const [duration, setDuration] = useState(initial?.duration ?? 0);
  const [distance, setDistance] = useState(initial?.distance ?? 0);
  const [calories, setCalories] = useState(initial?.calories ?? 0);
  const [bodyPart, setBodyPart] = useState(initial?.bodyPart ?? BODY_PARTS[0]);
  const [weight, setWeight] = useState(initial?.weight ?? 0);
  const [reps, setReps] = useState(initial?.reps ?? 0);
  const [sets, setSets] = useState(initial?.sets ?? 0);
  const [activeField, setActiveField] = useState(null);

  const accent = ACCENT[type];
  const valid = type === "aerobic" ? name.trim() : name.trim() && bodyPart;

  const fieldMeta =
    type === "aerobic"
      ? {
          duration: { label: "時間", unit: "分", value: duration, setValue: setDuration },
          distance: { label: "距離", unit: "km", value: distance, setValue: setDistance, decimal: true, decimalPlaces: 1 },
          calories: { label: "カロリー", unit: "kcal", value: calories, setValue: setCalories },
        }
      : {
          weight: { label: "重さ", unit: "kg", value: weight, setValue: setWeight, decimal: true },
          reps: { label: "レップ", unit: "回", value: reps, setValue: setReps },
          sets: { label: "セット", unit: "set", value: sets, setValue: setSets },
        };
  const order = Object.keys(fieldMeta);

  const confirmField = (val) => {
    fieldMeta[activeField].setValue(val);
    const idx = order.indexOf(activeField);
    if (idx >= 0 && idx < order.length - 1) {
      setActiveField(order[idx + 1]);
    } else {
      setActiveField(null);
    }
  };

  const handleNameChange = (val) => {
    setName(val);
    if (type === "weight") {
      const map = exerciseToPartMap(customExercises);
      if (val && map[val]) setBodyPart(map[val]);
    }
  };

  const submit = () => {
    if (!valid) return;
    const trimmed = name.trim();
    if (type === "aerobic") {
      if (!aerobicOptions(customExercises).includes(trimmed)) onRegisterExercise("aerobic", trimmed);
      onSave({ type, name: trimmed, machine, duration, distance, calories });
    } else {
      const map = exerciseToPartMap(customExercises);
      if (!(trimmed in map)) onRegisterExercise("weight", trimmed, bodyPart);
      onSave({ type, name: trimmed, bodyPart, machine, weight, reps, sets });
    }
  };

  return (
    <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: C.panel, border: `1px solid ${accent}33` }}>
      <p style={{ fontSize: 11, color: C.dim4, marginBottom: 6, fontWeight: 700 }}>種目</p>
      <div className="mb-3">
        {type === "aerobic" ? (
          <ExercisePicker options={aerobicOptions(customExercises)} value={name} onChange={handleNameChange} placeholder="種目を選択" />
        ) : (
          <ExercisePicker groups={weightGroups(customExercises)} value={name} onChange={handleNameChange} placeholder="種目を選択(部位は自動選択されます)" />
        )}
      </div>

      {type === "weight" && (
        <>
          <p style={{ fontSize: 11, color: C.dim4, marginBottom: 6, fontWeight: 700 }}>対象部位 <span style={{ color: C.dim5, fontWeight: 400 }}>(種目から自動選択・タップで変更可)</span></p>
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {BODY_PARTS.map((p) => (
              <button
                key={p}
                onClick={() => setBodyPart(p)}
                className="py-2 rounded-lg font-bold"
                style={
                  bodyPart === p
                    ? { backgroundColor: accent, color: C.dark, fontSize: 12, border: "none" }
                    : { backgroundColor: C.panelHover, color: C.dim2, fontSize: 12, border: "none" }
                }
              >
                {p}
              </button>
            ))}
          </div>
        </>
      )}

      <p style={{ fontSize: 11, color: C.dim4, marginBottom: 6, fontWeight: 700 }}>マシン / フリー</p>
      <div className="mb-3">
        <PillToggle
          color={accent}
          value={machine}
          onChange={setMachine}
          options={[
            { value: true, label: "マシン" },
            { value: false, label: type === "aerobic" ? "マシン無し" : "フリーウェイト" },
          ]}
        />
      </div>

      <div className="flex gap-2">
        {order.map((key) => (
          <FieldBox
            key={key}
            label={fieldMeta[key].label}
            unit={fieldMeta[key].unit}
            value={fieldMeta[key].value}
            active={activeField === key}
            onOpen={() => setActiveField(key)}
          />
        ))}
      </div>
      <p style={{ fontSize: 10.5, color: C.dim5, marginTop: 6 }}>項目をタップして入力すると、次の項目へ自動で進みます</p>

      {activeField && (
        <NumberPad
          key={activeField}
          label={fieldMeta[activeField].label}
          unit={fieldMeta[activeField].unit}
          initial={fieldMeta[activeField].value}
          allowDecimal={fieldMeta[activeField].decimal}
          decimalPlaces={fieldMeta[activeField].decimalPlaces}
          onClose={() => setActiveField(null)}
          onConfirm={confirmField}
        />
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={onCancel} className="px-4 py-2.5 rounded-xl font-semibold" style={{ backgroundColor: C.panelHover, color: C.dim2, fontSize: 14, border: "none" }}>
          閉じる
        </button>
        {onDelete && (
          <button onClick={onDelete} className="px-4 py-2.5 rounded-xl font-semibold flex items-center gap-1.5" style={{ backgroundColor: "rgba(229,103,90,0.12)", color: C.danger, fontSize: 14, border: "none" }}>
            <Trash2 size={15} /> 削除
          </button>
        )}
        <div className="flex-1">
          <BigButton color={accent} onClick={submit} disabled={!valid} icon={mode === "add" ? Plus : Check}>
            {mode === "add" ? "この種目を記録" : "更新する"}
          </BigButton>
        </div>
      </div>
    </div>
  );
}

/* テキストレポート表示・ワンタップコピー用のボトムシート */
function ReportSheet({ session, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = buildReportText(session);

  const handleCopy = async () => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onClose} />
      <div
        className="relative w-full rounded-t-3xl p-5"
        style={{ backgroundColor: C.sheet, maxHeight: "85vh", overflowY: "auto", animation: "slideUp .18s ease-out" }}
      >
        <div className="flex justify-between items-center mb-3">
          <p style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>テキストで出力</p>
          <button onClick={onClose} className="p-1" style={{ color: C.dim4, background: "none", border: "none" }}>
            <X size={20} />
          </button>
        </div>
        <p style={{ color: C.dim4, fontSize: 11, marginBottom: 10, lineHeight: 1.6 }}>
          Google Healthアプリのコーチなどにそのまま貼り付けられる形式です
        </p>
        <textarea
          readOnly
          value={text}
          rows={11}
          className="w-full rounded-xl p-3 mb-4"
          style={{ backgroundColor: C.panelHover, color: C.text, fontSize: 13, border: "none", outline: "none", lineHeight: 1.7, fontFamily: "ui-monospace, monospace", resize: "none" }}
        />
        <BigButton color={copied ? C.aerobic : C.weight} onClick={handleCopy} icon={copied ? ClipboardCheck : Copy}>
          {copied ? "コピーしました" : "この内容をコピーする"}
        </BigButton>
      </div>
    </div>
  );
}

/* 自己評価・メモ編集用のボトムシート */
function EditMetaSheet({ session, onSave, onClose }) {
  const [rating, setRating] = useState(session.rating);
  const [note, setNote] = useState(session.note || "");
  const [date, setDate] = useState(toDateInputValue(session.date));

  return (
    <div className="fixed inset-0 z-40 flex items-end">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onClose} />
      <div
        className="relative w-full rounded-t-3xl p-5"
        style={{ backgroundColor: C.sheet, maxHeight: "85vh", overflowY: "auto", animation: "slideUp .18s ease-out" }}
      >
        <div className="flex justify-between items-center mb-4">
          <p style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>評価・メモを編集</p>
          <button onClick={onClose} className="p-1" style={{ color: C.dim4, background: "none", border: "none" }}>
            <X size={20} />
          </button>
        </div>

        <p style={{ color: C.dim2, fontSize: 13, marginBottom: 8, fontWeight: 700 }}>トレーニング日</p>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-xl py-3 px-3 mb-5"
          style={{ backgroundColor: C.panelHover, color: C.text, fontSize: 14, border: "none", colorScheme: "dark" }}
        />

        <p style={{ color: C.dim2, fontSize: 13, marginBottom: 10, fontWeight: 700 }}>自己評価</p>
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} style={{ background: "none", border: "none" }}>
              <Star size={34} fill={n <= rating ? C.weight : "none"} color={n <= rating ? C.weight : "#3A3F44"} strokeWidth={1.5} />
            </button>
          ))}
        </div>

        <p style={{ color: C.dim2, fontSize: 13, marginBottom: 8, fontWeight: 700 }}>ひとこと</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="今日の調子や気づいたことをメモ"
          rows={4}
          className="w-full rounded-xl p-3 mb-5 resize-none"
          style={{ backgroundColor: C.panelHover, color: C.text, fontSize: 14, border: "none", outline: "none" }}
        />

        <BigButton color={C.weight} onClick={() => onSave({ rating, note, date: fromDateInputValue(date) })} disabled={rating === 0}>
          保存する
        </BigButton>
      </div>
    </div>
  );
}

/* 編集用ボトムシート(既存の1件を編集) */
function EditEntrySheet({ entry, customExercises, onRegisterExercise, onSave, onDelete, onClose }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} onClick={onClose} />
      <div
        className="relative w-full rounded-t-3xl p-5"
        style={{ backgroundColor: C.sheet, maxHeight: "90vh", overflowY: "auto", animation: "slideUp .18s ease-out" }}
      >
        <div className="flex justify-between items-center mb-4">
          <p style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>種目を編集</p>
          <button onClick={onClose} className="p-1" style={{ color: C.dim4, background: "none", border: "none" }}>
            <X size={20} />
          </button>
        </div>
        <EntryForm
          type={entry.type}
          initial={entry}
          mode="edit"
          customExercises={customExercises}
          onRegisterExercise={onRegisterExercise}
          onSave={onSave}
          onDelete={onDelete}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

function EntryRow({ entry, onDelete, onEdit }) {
  const accent = ACCENT[entry.type];
  return (
    <div
      className="flex items-center gap-3 rounded-xl p-3 mb-2"
      style={{ backgroundColor: C.panelSoft, cursor: onEdit ? "pointer" : "default" }}
      onClick={onEdit}
    >
      <div style={{ width: 6, height: 40, borderRadius: 999, backgroundColor: accent, flexShrink: 0 }} />
      <div className="flex-1">
        <p style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>
          {entry.name}{" "}
          {entry.type === "weight" && <span style={{ color: C.dim3, fontWeight: 400 }}>({entry.bodyPart})</span>}
        </p>
        <p style={{ color: C.dim3, fontSize: 12 }}>
          {entry.type === "aerobic"
            ? `${entry.machine ? "マシン" : "マシン無し"} ・ ${entry.duration}分 / ${entry.distance}km / ${entry.calories}kcal`
            : `${entry.machine ? "マシン" : "フリー"} ・ ${entry.weight}kg × ${entry.reps}回 × ${entry.sets}set`}
        </p>
      </div>
      {onEdit && <Pencil size={14} color={C.dim5} style={{ flexShrink: 0 }} />}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1"
          style={{ color: C.dim5, background: "none", border: "none", flexShrink: 0 }}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  セッション(記録)画面                                                 */
/* ------------------------------------------------------------------ */

function SessionScreen({ customExercises, onRegisterExercise, onFinish, onExit }) {
  const [type, setType] = useState("weight");
  const [entries, setEntries] = useState([]);
  const [showForm, setShowForm] = useState(true);
  const [editingIndex, setEditingIndex] = useState(null);
  const [formKey, setFormKey] = useState(0);

  const addEntry = (e) => {
    setEntries((prev) => [...prev, e]);
    setShowForm(false);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <TopBar title="トレーニング記録中" onBack={onExit} accent={ACCENT[type]} />
      <div className="px-5 pt-5" style={{ paddingBottom: 130 }}>
        <PillToggle
          color={ACCENT[type]}
          value={type}
          onChange={(t) => { setType(t); setShowForm(true); setFormKey((k) => k + 1); }}
          options={[
            { value: "weight", label: "🏋️ ウェイト" },
            { value: "aerobic", label: "🏃 有酸素" },
          ]}
        />

        <div className="mt-5">
          {showForm ? (
            <EntryForm
              key={formKey}
              type={type}
              mode="add"
              customExercises={customExercises}
              onRegisterExercise={onRegisterExercise}
              onSave={addEntry}
              onCancel={() => entries.length > 0 && setShowForm(false)}
            />
          ) : (
            <button
              onClick={() => { setShowForm(true); setFormKey((k) => k + 1); }}
              className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 font-bold mb-4"
              style={{ border: `2px dashed ${ACCENT[type]}55`, color: ACCENT[type], fontSize: 14, backgroundColor: "transparent" }}
            >
              <Plus size={18} /> {type === "aerobic" ? "有酸素" : "ウェイト"}の種目を追加
            </button>
          )}
        </div>

        {entries.length > 0 && (
          <div>
            <p style={{ color: C.dim3, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>この回の記録 ({entries.length}種目) ・ タップで編集</p>
            {entries.map((e, i) => (
              <EntryRow
                key={i}
                entry={e}
                onEdit={() => setEditingIndex(i)}
                onDelete={() => setEntries(entries.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        )}
      </div>

      {editingIndex !== null && (
        <EditEntrySheet
          entry={entries[editingIndex]}
          customExercises={customExercises}
          onRegisterExercise={onRegisterExercise}
          onSave={(updated) => {
            setEntries(entries.map((e, i) => (i === editingIndex ? updated : e)));
            setEditingIndex(null);
          }}
          onDelete={() => {
            setEntries(entries.filter((_, i) => i !== editingIndex));
            setEditingIndex(null);
          }}
          onClose={() => setEditingIndex(null)}
        />
      )}

      {entries.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 p-4"
          style={{ background: `linear-gradient(to top, ${C.bg} 60%, transparent)` }}
        >
          <BigButton color={C.text} onClick={() => onFinish(entries)} icon={Check}>
            トレーニングを終了する
          </BigButton>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  自己評価 → 保存確認                                                  */
/* ------------------------------------------------------------------ */

function RatingScreen({ entries, onConfirm, onBack }) {
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(toDateInputValue(new Date().toISOString()));

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <TopBar title="お疲れさまでした" onBack={onBack} />
      <div className="px-5 pt-6 pb-10">
        <p style={{ color: C.dim2, fontSize: 14, marginBottom: 8, fontWeight: 700 }}>トレーニング日</p>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-xl py-3 px-3 mb-1"
          style={{ backgroundColor: C.panelHover, color: C.text, fontSize: 14, border: "none", colorScheme: "dark" }}
        />
        <p style={{ color: C.dim5, fontSize: 11, marginBottom: 20 }}>今日の日付が自動入力されています。過去分をあとから記録する場合は変更してください</p>

        <p style={{ color: C.dim2, fontSize: 14, marginBottom: 12, fontWeight: 700 }}>今日の自己評価</p>
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)} style={{ background: "none", border: "none" }}>
              <Star size={38} fill={n <= rating ? C.weight : "none"} color={n <= rating ? C.weight : "#3A3F44"} strokeWidth={1.5} />
            </button>
          ))}
        </div>

        <p style={{ color: C.dim2, fontSize: 14, marginBottom: 8, fontWeight: 700 }}>ひとこと(任意)</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="今日の調子や気づいたことをメモ"
          rows={4}
          className="w-full rounded-xl p-3 mb-6 resize-none"
          style={{ backgroundColor: C.panelHover, color: C.text, fontSize: 14, border: "none", outline: "none" }}
        />

        <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: C.panelSoft }}>
          <p style={{ color: C.dim3, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>今回のサマリー</p>
          <p style={{ color: C.text, fontSize: 14 }}>全 {entries.length} 種目</p>
          <p style={{ color: C.dim3, fontSize: 12, marginTop: 2 }}>
            ウェイト {entries.filter((e) => e.type === "weight").length}種目 ・
            有酸素 {entries.filter((e) => e.type === "aerobic").length}種目
          </p>
        </div>

        <BigButton color={C.weight} onClick={() => onConfirm({ rating, note, date: fromDateInputValue(date) })} disabled={rating === 0}>
          記録を保存する
        </BigButton>
        {rating === 0 && <p style={{ textAlign: "center", color: C.dim4, fontSize: 12, marginTop: 8 }}>評価を選んでください</p>}
      </div>
    </div>
  );
}

function SavedScreen({ session, onDone }) {
  const [showReport, setShowReport] = useState(false);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center" style={{ backgroundColor: C.bg }}>
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{ background: `linear-gradient(135deg, ${C.weight}, ${C.aerobic})` }}
      >
        <Check size={40} color={C.dark} strokeWidth={3} />
      </div>
      <h2 style={{ color: C.text, fontSize: 20, fontWeight: 900, marginBottom: 8 }}>記録を保存しました</h2>
      <p style={{ color: C.dim3, fontSize: 14, marginBottom: 32 }}>お疲れさまでした。仲間の記録にも反映されます。</p>
      <div className="w-full" style={{ maxWidth: 320 }}>
        <div className="mb-3">
          <BigButton color={C.weight} variant="outline" onClick={() => setShowReport(true)} icon={Copy}>
            テキストで出力してコピー
          </BigButton>
        </div>
        <BigButton color={C.text} onClick={onDone}>メニューに戻る</BigButton>
      </div>
      {showReport && session && <ReportSheet session={session} onClose={() => setShowReport(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  履歴画面 (保存済みの記録もタップして編集できる)                        */
/* ------------------------------------------------------------------ */

function HistoryScreen({ sessions, user, customExercises, onRegisterExercise, onBack, onUpdateSessionEntries, onUpdateSessionMeta }) {
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [reportSession, setReportSession] = useState(null);
  const [editingMetaId, setEditingMetaId] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filteredSessions = filterSessionsByDate(sessions, fromDate, toDate);

  const editingEntry =
    editing != null ? sessions.find((s) => s.id === editing.sessionId)?.entries[editing.index] : null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <TopBar title="履歴" onBack={onBack} />
      <div className="px-5 pt-4 pb-10">
        {sessions.length > 0 && (
          <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: C.panel }}>
            <p style={{ fontSize: 11, color: C.dim4, marginBottom: 8, fontWeight: 700 }}>期間で絞り込み(空欄なら全期間)</p>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <p style={{ fontSize: 10, color: C.dim4, marginBottom: 4 }}>開始日</p>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-lg py-2 px-2"
                  style={{ backgroundColor: C.panelHover, color: C.text, border: "none", fontSize: 13, colorScheme: "dark" }}
                />
              </div>
              <div className="flex-1">
                <p style={{ fontSize: 10, color: C.dim4, marginBottom: 4 }}>終了日</p>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-lg py-2 px-2"
                  style={{ backgroundColor: C.panelHover, color: C.text, border: "none", fontSize: 13, colorScheme: "dark" }}
                />
              </div>
            </div>
            {(fromDate || toDate) && (
              <button
                onClick={() => { setFromDate(""); setToDate(""); }}
                style={{ color: C.dim3, fontSize: 11, background: "none", border: "none", textDecoration: "underline" }}
              >
                絞り込みを解除
              </button>
            )}
          </div>
        )}

        {sessions.length > 0 && (
          <button
            onClick={() => downloadCSV(filteredSessions, user)}
            disabled={filteredSessions.length === 0}
            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold mb-4"
            style={{ backgroundColor: C.panelHover, color: filteredSessions.length === 0 ? C.dim4 : C.dim1, fontSize: 13, border: "none" }}
          >
            <FileDown size={16} /> {filteredSessions.length}件をCSVで出力
          </button>
        )}
        {sessions.length === 0 && (
          <p style={{ color: C.dim5, fontSize: 14, textAlign: "center", marginTop: 64 }}>まだ記録がありません</p>
        )}
        {[...sessions].reverse().map((s) => (
          <div key={s.id} className="mb-3 rounded-2xl overflow-hidden" style={{ backgroundColor: C.panelSoft }}>
            <div className="w-full p-4 flex justify-between items-center">
              <button
                onClick={() => setOpenId(openId === s.id ? null : s.id)}
                className="flex-1 text-left"
                style={{ background: "none", border: "none" }}
              >
                <p style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>
                  {new Date(s.date).toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}
                </p>
                <p style={{ color: C.dim3, fontSize: 12, marginTop: 2 }}>
                  {s.entries.length}種目 ・ 評価 {"★".repeat(s.rating)}{"☆".repeat(5 - s.rating)}
                </p>
              </button>
              <button
                onClick={() => setReportSession(s)}
                className="p-2 rounded-lg mr-1"
                style={{ backgroundColor: C.panelHover, color: C.dim1, border: "none" }}
                title="テキストで出力"
              >
                <Copy size={16} />
              </button>
              <button
                onClick={() => setOpenId(openId === s.id ? null : s.id)}
                className="p-1"
                style={{ background: "none", border: "none" }}
              >
                <ChevronRight size={18} color={C.dim4} style={{ transform: openId === s.id ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
              </button>
            </div>
            {openId === s.id && (
              <div className="px-4 pb-4">
                {s.entries.map((e, i) => (
                  <EntryRow
                    key={i}
                    entry={e}
                    onEdit={() => setEditing({ sessionId: s.id, index: i })}
                    onDelete={() => {
                      const newEntries = s.entries.filter((_, idx) => idx !== i);
                      onUpdateSessionEntries(s.id, newEntries);
                    }}
                  />
                ))}
                {s.entries.length === 0 && <p style={{ color: C.dim4, fontSize: 12 }}>記録がありません</p>}
                <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
                  <div>
                    <p style={{ color: C.weight, fontSize: 13 }}>{"★".repeat(s.rating)}{"☆".repeat(5 - s.rating)}</p>
                    {s.note && <p style={{ color: C.dim2, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>"{s.note}"</p>}
                  </div>
                  <button
                    onClick={() => setEditingMetaId(s.id)}
                    className="px-3 py-2 rounded-lg flex items-center gap-1.5 flex-shrink-0"
                    style={{ backgroundColor: C.panelHover, color: C.dim1, fontSize: 12, border: "none" }}
                  >
                    <Pencil size={13} /> 評価・メモ
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {editingEntry && (
        <EditEntrySheet
          entry={editingEntry}
          customExercises={customExercises}
          onRegisterExercise={onRegisterExercise}
          onSave={(updated) => {
            const s = sessions.find((x) => x.id === editing.sessionId);
            const newEntries = s.entries.map((e, i) => (i === editing.index ? updated : e));
            onUpdateSessionEntries(s.id, newEntries);
            setEditing(null);
          }}
          onDelete={() => {
            const s = sessions.find((x) => x.id === editing.sessionId);
            const newEntries = s.entries.filter((_, i) => i !== editing.index);
            onUpdateSessionEntries(s.id, newEntries);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {reportSession && <ReportSheet session={reportSession} onClose={() => setReportSession(null)} />}

      {editingMetaId != null && (
        <EditMetaSheet
          session={sessions.find((s) => s.id === editingMetaId)}
          onSave={(meta) => {
            onUpdateSessionMeta(editingMetaId, meta);
            setEditingMetaId(null);
          }}
          onClose={() => setEditingMetaId(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  種目管理画面                                                        */
/* ------------------------------------------------------------------ */

function ManageAddForm({ type, onAdd }) {
  const [name, setName] = useState("");
  const [bodyPart, setBodyPart] = useState(BODY_PARTS[0]);
  const [error, setError] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = onAdd(trimmed, bodyPart);
    if (ok === false) {
      setError("すでに登録されている種目名です");
      return;
    }
    setName("");
    setError("");
  };

  return (
    <div className="rounded-2xl p-4 mt-2" style={{ backgroundColor: C.panel, border: `1px dashed ${C.border}` }}>
      <p style={{ fontSize: 11, color: C.dim4, marginBottom: 6, fontWeight: 700 }}>新しい種目を追加</p>
      <input
        value={name}
        onChange={(e) => { setName(e.target.value); setError(""); }}
        placeholder="種目名"
        className="w-full rounded-xl py-3 px-3 mb-3 font-semibold"
        style={{ backgroundColor: C.panelHover, color: C.text, fontSize: 14, border: "none", outline: "none" }}
      />
      {type === "weight" && (
        <>
          <p style={{ fontSize: 11, color: C.dim4, marginBottom: 6, fontWeight: 700 }}>対象部位</p>
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {BODY_PARTS.map((p) => (
              <button
                key={p}
                onClick={() => setBodyPart(p)}
                className="py-2 rounded-lg font-bold"
                style={
                  bodyPart === p
                    ? { backgroundColor: C.weight, color: C.dark, fontSize: 12, border: "none" }
                    : { backgroundColor: C.panelHover, color: C.dim2, fontSize: 12, border: "none" }
                }
              >
                {p}
              </button>
            ))}
          </div>
        </>
      )}
      {error && <p style={{ color: C.danger, fontSize: 12, marginBottom: 8 }}>{error}</p>}
      <BigButton color={type === "aerobic" ? C.aerobic : C.weight} onClick={submit} disabled={!name.trim()} icon={Plus}>
        追加する
      </BigButton>
    </div>
  );
}

function ManageExerciseRow({ name, isCustom, bodyPart, onMove, onDelete, moveOpen, onToggleMove }) {
  return (
    <div className="rounded-xl mb-2 overflow-hidden" style={{ backgroundColor: C.panelSoft }}>
      <div className="flex items-center gap-2 p-3">
        <p className="flex-1" style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{name}</p>
        {isCustom ? (
          <>
            {onMove && (
              <button onClick={onToggleMove} className="px-2 py-1 rounded-lg" style={{ backgroundColor: C.panelHover, color: C.dim2, fontSize: 11, border: "none" }}>
                {bodyPart} ▾
              </button>
            )}
            <button onClick={onDelete} className="p-1" style={{ color: C.dim5, background: "none", border: "none" }}>
              <Trash2 size={15} />
            </button>
          </>
        ) : (
          <span style={{ color: C.dim5, fontSize: 11, backgroundColor: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 999 }}>標準</span>
        )}
      </div>
      {moveOpen && (
        <div className="grid grid-cols-6 gap-1.5 px-3 pb-3">
          {BODY_PARTS.map((p) => (
            <button
              key={p}
              onClick={() => onMove(p)}
              className="py-1.5 rounded-lg font-bold"
              style={
                bodyPart === p
                  ? { backgroundColor: C.weight, color: C.dark, fontSize: 11, border: "none" }
                  : { backgroundColor: C.panelHover, color: C.dim2, fontSize: 11, border: "none" }
              }
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ExerciseManageScreen({ customExercises, onAdd, onDelete, onMoveBodyPart, onBack }) {
  const [tab, setTab] = useState("weight");
  const [moveId, setMoveId] = useState(null);

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <TopBar title="種目管理" onBack={onBack} />
      <div className="px-5 pt-5 pb-10">
        <PillToggle
          color={ACCENT[tab]}
          value={tab}
          onChange={(t) => { setTab(t); setMoveId(null); }}
          options={[
            { value: "weight", label: "🏋️ ウェイト" },
            { value: "aerobic", label: "🏃 有酸素" },
          ]}
        />

        {tab === "weight" ? (
          <div className="mt-5">
            {BODY_PARTS.map((part) => (
              <div key={part} className="mb-5">
                <p style={{ color: C.weight, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{part}</p>
                {DEFAULT_WEIGHT_EXERCISES[part].map((n) => (
                  <ManageExerciseRow key={n} name={n} isCustom={false} />
                ))}
                {customExercises.weight
                  .filter((c) => c.bodyPart === part)
                  .map((c) => (
                    <ManageExerciseRow
                      key={c.id}
                      name={c.name}
                      isCustom
                      bodyPart={c.bodyPart}
                      moveOpen={moveId === c.id}
                      onToggleMove={() => setMoveId(moveId === c.id ? null : c.id)}
                      onMove={(p) => { onMoveBodyPart(c.id, p); setMoveId(null); }}
                      onDelete={() => onDelete("weight", c.id)}
                    />
                  ))}
              </div>
            ))}
            <ManageAddForm type="weight" onAdd={(name, bodyPart) => onAdd("weight", name, bodyPart)} />
          </div>
        ) : (
          <div className="mt-5">
            {DEFAULT_AEROBIC_EXERCISES.map((n) => (
              <ManageExerciseRow key={n} name={n} isCustom={false} />
            ))}
            {customExercises.aerobic.map((c) => (
              <ManageExerciseRow key={c.id} name={c.name} isCustom onDelete={() => onDelete("aerobic", c.id)} />
            ))}
            <ManageAddForm type="aerobic" onAdd={(name) => onAdd("aerobic", name)} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  体ヒートマップ (サイン要素)                                          */
/* ------------------------------------------------------------------ */

function intensityColor(ratio, color) {
  const alpha = 0.08 + ratio * 0.82;
  return { fill: color, fillOpacity: alpha };
}

function BodyFigure({ view, volumes, max, accent }) {
  const r = (part) => (max > 0 ? (volumes[part] || 0) / max : 0);
  const style = (part) => intensityColor(r(part), accent);

  if (view === "front") {
    return (
      <svg viewBox="0 0 200 340" style={{ width: "100%", maxWidth: 220, margin: "0 auto", display: "block" }}>
        <circle cx="100" cy="28" r="20" fill="#2A2F34" />
        <rect x="90" y="46" width="20" height="16" rx="4" fill="#2A2F34" />
        <path d="M60 70 Q100 58 140 70 L150 120 Q100 140 50 120 Z" style={style("胸")} />
        <circle cx="48" cy="80" r="18" style={style("肩")} />
        <circle cx="152" cy="80" r="18" style={style("肩")} />
        <rect x="28" y="95" width="20" height="90" rx="10" style={style("腕")} />
        <rect x="152" y="95" width="20" height="90" rx="10" style={style("腕")} />
        <rect x="70" y="128" width="60" height="70" rx="10" style={style("腹")} />
        <rect x="70" y="205" width="24" height="110" rx="10" style={style("脚")} />
        <rect x="106" y="205" width="24" height="110" rx="10" style={style("脚")} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 340" style={{ width: "100%", maxWidth: 220, margin: "0 auto", display: "block" }}>
      <circle cx="100" cy="28" r="20" fill="#2A2F34" />
      <rect x="90" y="46" width="20" height="16" rx="4" fill="#2A2F34" />
      <circle cx="48" cy="80" r="18" style={style("肩")} />
      <circle cx="152" cy="80" r="18" style={style("肩")} />
      <path d="M55 68 Q100 56 145 68 L150 190 Q100 210 50 190 Z" style={style("背中")} />
      <rect x="28" y="95" width="20" height="90" rx="10" style={style("腕")} />
      <rect x="152" y="95" width="20" height="90" rx="10" style={style("腕")} />
      <rect x="70" y="205" width="24" height="110" rx="10" style={style("脚")} />
      <rect x="106" y="205" width="24" height="110" rx="10" style={style("脚")} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  月間総重量ランキング画面                                             */
/* ------------------------------------------------------------------ */

function RankingScreen({ users, currentUser, onBack }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const byUser = await db.getAllSessionsForRanking();
        const computed = users.map((u) => ({ user: u, total: monthlyWeightVolume(byUser[u] || []) }));
        computed.sort((a, b) => b.total - a.total);
        if (!cancelled) {
          setRows(computed);
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [users]);

  const max = Math.max(1, ...rows.map((r) => r.total));
  const monthLabel = new Date().toLocaleDateString("ja-JP", { month: "long" });
  const medal = ["🥇", "🥈", "🥉"];

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <TopBar title="月間ランキング" onBack={onBack} accent={C.weight} />
      <div className="px-5 pt-5 pb-10">
        <p style={{ color: C.dim3, fontSize: 13, marginBottom: 16 }}>{monthLabel}の総重量(重さ×レップ×セット)ランキング</p>

        {loading && <p style={{ color: C.dim4, fontSize: 13, textAlign: "center", marginTop: 40 }}>集計中...</p>}

        {!loading && rows.length === 0 && (
          <p style={{ color: C.dim5, fontSize: 14, textAlign: "center", marginTop: 64 }}>まだメンバーがいません</p>
        )}

        {!loading &&
          rows.map((r, i) => (
            <div
              key={r.user}
              className="rounded-2xl p-4 mb-3"
              style={{
                backgroundColor: r.user === currentUser ? "rgba(242,169,59,0.10)" : C.panelSoft,
                border: r.user === currentUser ? `1px solid ${C.weight}55` : "1px solid transparent",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 18, width: 26, textAlign: "center" }}>{i < 3 ? medal[i] : i + 1}</span>
                  <p style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{r.user}</p>
                  {r.user === currentUser && (
                    <span style={{ color: C.weight, fontSize: 11, backgroundColor: "rgba(242,169,59,0.15)", padding: "1px 8px", borderRadius: 999 }}>
                      あなた
                    </span>
                  )}
                </div>
                <p className="tabular-nums" style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>
                  {r.total.toLocaleString()}<span style={{ fontSize: 11, color: C.dim3, marginLeft: 2 }}>kg</span>
                </p>
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 8, backgroundColor: C.panelHover }}>
                <div style={{ height: "100%", borderRadius: 999, width: `${(r.total / max) * 100}%`, backgroundColor: i === 0 ? C.weight : C.aerobic }} />
              </div>
            </div>
          ))}

        <p style={{ color: C.dim5, fontSize: 11, marginTop: 8, textAlign: "center" }}>
          ウェイトトレーニングの総負荷量(重さ×レップ×セット)の合計を、今月分だけ集計しています
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ログイン(名前選択)画面                                               */
/* ------------------------------------------------------------------ */

function LoginScreen({ users, onSelect }) {
  const [name, setName] = useState("");
  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10" style={{ backgroundColor: C.bg }}>
      <div className="text-center mb-10">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
          style={{ background: `linear-gradient(135deg, ${C.weight}, ${C.aerobic})` }}
        >
          <Dumbbell size={30} color={C.dark} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: C.text, letterSpacing: -0.5 }}>LOGLIFT</h1>
        <p style={{ color: C.dim3, fontSize: 14, marginTop: 4 }}>仲間と記録する、トレーニングログ</p>
      </div>

      {users.length > 0 && (
        <div className="mb-6">
          <p style={{ color: C.dim4, fontSize: 12, marginBottom: 8, fontWeight: 700 }}>メンバーを選ぶ</p>
          <div className="flex flex-wrap gap-2">
            {users.map((u) => (
              <button
                key={u}
                onClick={() => onSelect(u)}
                className="px-4 py-2.5 rounded-xl font-semibold"
                style={{ backgroundColor: C.panelHover, color: C.text, fontSize: 14, border: "none" }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      )}

      <p style={{ color: C.dim4, fontSize: 12, marginBottom: 8, fontWeight: 700 }}>新しく参加する</p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前(ニックネーム)"
          className="flex-1 rounded-xl py-3 px-4"
          style={{ backgroundColor: C.panelHover, color: C.text, border: "none", outline: "none" }}
        />
        <button
          onClick={() => name.trim() && onSelect(name.trim())}
          disabled={!name.trim()}
          className="px-5 rounded-xl font-bold"
          style={{
            backgroundColor: name.trim() ? C.weight : "rgba(255,255,255,0.08)",
            color: name.trim() ? C.dark : C.dim4,
            border: "none",
          }}
        >
          開始
        </button>
      </div>
      <p style={{ color: C.dim5, fontSize: 11, marginTop: 24, lineHeight: 1.6 }}>
        ※ 名前を選ぶだけで参加できる簡易グループです。記録は同じアプリを使う仲間全員に共有されます。
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  メニュー画面                                                        */
/* ------------------------------------------------------------------ */

function MenuScreen({ user, onNav, onSwitchUser }) {
  return (
    <div className="min-h-screen px-5 pt-8 pb-10" style={{ backgroundColor: C.bg }}>
      <div className="flex justify-between items-start mb-8">
        <div>
          <p style={{ color: C.dim3, fontSize: 12 }}>おかえりなさい</p>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: C.text }}>{user}さん</h1>
        </div>
        <button onClick={onSwitchUser} style={{ color: C.dim3, fontSize: 12, textDecoration: "underline", background: "none", border: "none" }}>
          切り替え
        </button>
      </div>

      <button
        onClick={() => onNav("session")}
        className="w-full rounded-3xl p-6 mb-4 text-left relative overflow-hidden transition"
        style={{ background: `linear-gradient(135deg, ${C.weight} 0%, ${C.aerobic} 100%)`, border: "none" }}
      >
        <p style={{ color: "rgba(16,18,20,0.7)", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>START</p>
        <p style={{ color: C.dark, fontSize: 20, fontWeight: 900 }}>トレーニングを始める</p>
        <Dumbbell style={{ position: "absolute", right: -8, bottom: -8, opacity: 0.2 }} size={80} color={C.dark} />
      </button>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <button onClick={() => onNav("history")} className="rounded-2xl p-4 text-left" style={{ backgroundColor: C.panel, border: "none" }}>
          <HistoryIcon size={20} color={C.dim1} style={{ marginBottom: 8 }} />
          <p style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>履歴</p>
          <p style={{ color: C.dim3, fontSize: 11 }}>過去の記録を見る・編集</p>
        </button>
        <button onClick={() => onNav("bodymap")} className="rounded-2xl p-4 text-left" style={{ backgroundColor: C.panel, border: "none" }}>
          <PersonStanding size={20} color={C.dim1} style={{ marginBottom: 8 }} />
          <p style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>部位別分布</p>
          <p style={{ color: C.dim3, fontSize: 11 }}>週間・月間ヒートマップ</p>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <button onClick={() => onNav("feed")} className="rounded-2xl p-4 text-left" style={{ backgroundColor: C.panel, border: "none" }}>
          <Users size={20} color={C.dim1} style={{ marginBottom: 8 }} />
          <p style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>仲間の記録</p>
          <p style={{ color: C.dim3, fontSize: 11 }}>グループの最新をチェック</p>
        </button>
        <button onClick={() => onNav("ranking")} className="rounded-2xl p-4 text-left" style={{ backgroundColor: C.panel, border: "none" }}>
          <Trophy size={20} color={C.dim1} style={{ marginBottom: 8 }} />
          <p style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>月間ランキング</p>
          <p style={{ color: C.dim3, fontSize: 11 }}>総重量で仲間と競おう</p>
        </button>
      </div>

      <button onClick={() => onNav("manage")} className="w-full rounded-2xl p-4 text-left mb-3" style={{ backgroundColor: C.panel, border: "none" }}>
        <div className="flex items-center gap-2 mb-1">
          <Settings size={18} color={C.dim1} />
          <p style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>種目管理</p>
        </div>
        <p style={{ color: C.dim3, fontSize: 11 }}>種目の追加・部位の紐付け</p>
      </button>

      <div className="mt-6 rounded-2xl p-4" style={{ backgroundColor: C.panelSoft, border: `1px solid ${C.border}` }}>
        <p style={{ color: C.dim2, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Google Health連携</p>
        <p style={{ color: C.dim4, fontSize: 11, lineHeight: 1.6 }}>
          Health Connect(Android)経由での自動同期は今後対応予定です。現在はこの画面から手動で記録してください。
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  部位別ヒートマップ画面                                               */
/* ------------------------------------------------------------------ */

function BodyMapScreen({ sessions, onBack }) {
  const [range, setRange] = useState("week");
  const [view, setView] = useState("front");

  const cutoff = Date.now() - (range === "week" ? 7 : 30) * 86400000;
  const volumes = {};
  BODY_PARTS.forEach((p) => (volumes[p] = 0));

  sessions.forEach((s) => {
    if (new Date(s.date).getTime() < cutoff) return;
    s.entries.forEach((e) => {
      if (e.type === "weight") {
        volumes[e.bodyPart] += (Number(e.weight) || 0) * (Number(e.reps) || 0) * (Number(e.sets) || 0);
      }
    });
  });
  const max = Math.max(1, ...Object.values(volumes));

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <TopBar title="部位別トレーニング分布" onBack={onBack} accent={C.weight} />
      <div className="px-5 pt-5 pb-10">
        <PillToggle
          color={C.weight}
          value={range}
          onChange={setRange}
          options={[{ value: "week", label: "週間" }, { value: "month", label: "月間" }]}
        />

        <div className="flex justify-center gap-4" style={{ margin: "16px 0" }}>
          <button onClick={() => setView("front")} style={{ fontSize: 14, fontWeight: 700, color: view === "front" ? C.text : C.dim4, background: "none", border: "none" }}>正面</button>
          <button onClick={() => setView("back")} style={{ fontSize: 14, fontWeight: 700, color: view === "back" ? C.text : C.dim4, background: "none", border: "none" }}>背面</button>
        </div>

        <div className="rounded-3xl py-6" style={{ backgroundColor: C.panelSoft }}>
          <BodyFigure view={view} volumes={volumes} max={max} accent={C.weight} />
        </div>

        <div className="mt-5 space-y-2">
          {BODY_PARTS.map((p) => (
            <div key={p} className="flex items-center gap-3">
              <span style={{ width: 32, color: C.dim2, fontSize: 12, fontWeight: 700 }}>{p}</span>
              <div className="flex-1 rounded-full overflow-hidden" style={{ height: 10, backgroundColor: C.panelHover }}>
                <div style={{ height: "100%", borderRadius: 999, width: `${(volumes[p] / max) * 100}%`, backgroundColor: C.weight }} />
              </div>
              <span className="tabular-nums" style={{ width: 64, textAlign: "right", color: C.dim3, fontSize: 11 }}>{volumes[p].toLocaleString()}kg</span>
            </div>
          ))}
        </div>
        <p style={{ color: C.dim5, fontSize: 11, marginTop: 16, textAlign: "center" }}>総負荷量(重さ×レップ×セット)を部位ごとに集計</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  仲間の記録フィード                                                   */
/* ------------------------------------------------------------------ */

function FeedScreen({ feed, onBack }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      <TopBar title="仲間の記録" onBack={onBack} />
      <div className="px-5 pt-4 pb-10">
        {feed.length === 0 && <p style={{ color: C.dim5, fontSize: 14, textAlign: "center", marginTop: 64 }}>まだ記録がありません</p>}
        {[...feed].reverse().map((f, i) => (
          <div key={i} className="mb-3 rounded-2xl p-4" style={{ backgroundColor: C.panelSoft }}>
            <div className="flex justify-between items-center mb-1">
              <p style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{f.user}</p>
              <p style={{ color: C.dim4, fontSize: 11 }}>{new Date(f.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</p>
            </div>
            <p style={{ color: C.dim2, fontSize: 12, marginBottom: 6 }}>{f.summary}</p>
            <p style={{ color: C.weight, fontSize: 12 }}>{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</p>
            {f.note && <p style={{ color: C.dim4, fontSize: 11, marginTop: 4, fontStyle: "italic" }}>"{f.note}"</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App root                                                           */
/* ------------------------------------------------------------------ */

export default function App() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [screen, setScreen] = useState("login");
  const [sessions, setSessions] = useState([]);
  const [feed, setFeed] = useState([]);
  const [pendingEntries, setPendingEntries] = useState([]);
  const [customExercises, setCustomExercises] = useState({ aerobic: [], weight: [] });
  const [lastSavedSession, setLastSavedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [u, ce] = await Promise.all([db.getUsers(), db.getCustomExercises()]);
        setUsers(u);
        setCustomExercises(ce);
      } catch (e) {
        console.error(e);
        setLoadError("データの読み込みに失敗しました。Supabaseの接続設定(.env)を確認してください。");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadFeed = useCallback(async () => {
    try {
      const raw = await db.getFeed(100);
      const withSummary = raw
        .map((s) => ({
          sessionId: s.id,
          user: s.user,
          date: s.date,
          rating: s.rating,
          note: s.note,
          summary: `ウェイト${s.entries.filter((e) => e.type === "weight").length}種目・有酸素${s.entries.filter((e) => e.type === "aerobic").length}種目`,
        }))
        .reverse();
      setFeed(withSummary);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const selectUser = useCallback(async (name) => {
    try {
      await db.ensureUser(name);
      const list = await db.getUsers();
      setUsers(list);
      setUser(name);
      const s = await db.getSessions(name);
      setSessions(s);
      await loadFeed();
      setScreen("menu");
    } catch (e) {
      console.error(e);
      setLoadError("ユーザーの読み込みに失敗しました。しばらくしてから再度お試しください。");
    }
  }, [loadFeed]);

  const finishSession = (entries) => {
    setPendingEntries(entries);
    setScreen("rating");
  };

  const confirmSave = async ({ rating, note, date }) => {
    try {
      const session = await db.createSession({
        user,
        date: date || new Date().toISOString(),
        entries: pendingEntries,
        rating,
        note,
      });
      setSessions((prev) => [...prev, session]);
      setLastSavedSession(session);
      await loadFeed();
      setScreen("saved");
    } catch (e) {
      console.error(e);
      setLoadError("保存に失敗しました。通信環境を確認してもう一度お試しください。");
    }
  };

  const updateSessionEntries = async (sessionId, newEntries) => {
    try {
      await db.updateSessionEntries(sessionId, newEntries);
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, entries: newEntries } : s)));
      await loadFeed();
    } catch (e) {
      console.error(e);
    }
  };

  const updateSessionMeta = async (sessionId, meta) => {
    try {
      await db.updateSessionMeta(sessionId, meta);
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, ...meta } : s)));
      await loadFeed();
    } catch (e) {
      console.error(e);
    }
  };

  const registerExercise = useCallback(async (type, name, bodyPart) => {
    const already =
      type === "aerobic"
        ? customExercises.aerobic.some((c) => c.name === name) || DEFAULT_AEROBIC_EXERCISES.includes(name)
        : customExercises.weight.some((c) => c.name === name) || Object.values(DEFAULT_WEIGHT_EXERCISES).some((arr) => arr.includes(name));
    if (already) return;
    try {
      await db.insertCustomExercise(type, name, bodyPart);
      const ce = await db.getCustomExercises();
      setCustomExercises(ce);
    } catch (e) {
      console.error(e);
    }
  }, [customExercises]);

  const addExerciseManual = useCallback(async (type, name, bodyPart) => {
    const already =
      type === "aerobic"
        ? customExercises.aerobic.some((c) => c.name === name) || DEFAULT_AEROBIC_EXERCISES.includes(name)
        : customExercises.weight.some((c) => c.name === name) || Object.values(DEFAULT_WEIGHT_EXERCISES).some((arr) => arr.includes(name));
    if (already) return false;
    await registerExercise(type, name, bodyPart);
    return true;
  }, [customExercises, registerExercise]);

  const deleteExercise = useCallback(async (type, id) => {
    try {
      await db.deleteCustomExercise(id);
      const ce = await db.getCustomExercises();
      setCustomExercises(ce);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const moveExerciseBodyPart = useCallback(async (id, newPart) => {
    try {
      await db.moveCustomExerciseBodyPart(id, newPart);
      const ce = await db.getCustomExercises();
      setCustomExercises(ce);
    } catch (e) {
      console.error(e);
    }
  }, []);

  if (loading) {
    return <div className="min-h-screen" style={{ backgroundColor: C.bg }} />;
  }

  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif" }}>
      <style>{`
        @keyframes slideUp { from { transform: translateY(30px); opacity:0 } to { transform: translateY(0); opacity:1 } }
      `}</style>

      {loadError && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: C.danger, color: "#fff", fontSize: 12, padding: "10px 16px", textAlign: "center" }}>
          {loadError}
        </div>
      )}

      {screen === "login" && <LoginScreen users={users} onSelect={selectUser} />}
      {screen === "menu" && <MenuScreen user={user} onNav={setScreen} onSwitchUser={() => setScreen("login")} />}
      {screen === "session" && (
        <SessionScreen
          customExercises={customExercises}
          onRegisterExercise={registerExercise}
          onFinish={finishSession}
          onExit={() => setScreen("menu")}
        />
      )}
      {screen === "rating" && <RatingScreen entries={pendingEntries} onConfirm={confirmSave} onBack={() => setScreen("session")} />}
      {screen === "saved" && <SavedScreen session={lastSavedSession} onDone={() => setScreen("menu")} />}
      {screen === "history" && (
        <HistoryScreen
          sessions={sessions}
          user={user}
          customExercises={customExercises}
          onRegisterExercise={registerExercise}
          onBack={() => setScreen("menu")}
          onUpdateSessionEntries={updateSessionEntries}
          onUpdateSessionMeta={updateSessionMeta}
        />
      )}
      {screen === "bodymap" && <BodyMapScreen sessions={sessions} onBack={() => setScreen("menu")} />}
      {screen === "feed" && <FeedScreen feed={feed} onBack={() => setScreen("menu")} />}
      {screen === "ranking" && <RankingScreen users={users} currentUser={user} onBack={() => setScreen("menu")} />}
      {screen === "manage" && (
        <ExerciseManageScreen
          customExercises={customExercises}
          onAdd={addExerciseManual}
          onDelete={deleteExercise}
          onMoveBodyPart={moveExerciseBodyPart}
          onBack={() => setScreen("menu")}
        />
      )}
    </div>
  );
}
