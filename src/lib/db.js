import { supabase } from "./supabase";

/* ------------------------------------------------------------------ */
/*  ユーザー(名前)                                                     */
/* ------------------------------------------------------------------ */

export async function getUsers() {
  const { data, error } = await supabase.from("users").select("name").order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((r) => r.name);
}

export async function ensureUser(name) {
  const { error } = await supabase.from("users").upsert({ name }, { onConflict: "name", ignoreDuplicates: true });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  セッション(1回分のトレーニング記録)                                  */
/* ------------------------------------------------------------------ */

function rowToSession(row) {
  return {
    id: row.id,
    date: row.date,
    entries: row.entries || [],
    rating: row.rating,
    note: row.note || "",
    user: row.user_name,
  };
}

export async function getSessions(userName) {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_name", userName)
    .order("date", { ascending: true });
  if (error) throw error;
  return data.map(rowToSession);
}

export async function createSession({ user, date, entries, rating, note }) {
  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_name: user, date, entries, rating, note })
    .select()
    .single();
  if (error) throw error;
  return rowToSession(data);
}

export async function updateSessionEntries(sessionId, entries) {
  const { error } = await supabase.from("sessions").update({ entries }).eq("id", sessionId);
  if (error) throw error;
}

export async function updateSessionMeta(sessionId, { rating, note, date }) {
  const { error } = await supabase.from("sessions").update({ rating, note, date }).eq("id", sessionId);
  if (error) throw error;
}

/* 仲間の記録フィード: 全ユーザーの直近のセッションをまとめて取得する */
export async function getFeed(limit = 100) {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(rowToSession);
}

/* 月間ランキング用: 全ユーザー分のセッションをまとめて取得する */
export async function getAllSessionsForRanking() {
  const { data, error } = await supabase.from("sessions").select("user_name, date, entries");
  if (error) throw error;
  const byUser = {};
  data.forEach((row) => {
    if (!byUser[row.user_name]) byUser[row.user_name] = [];
    byUser[row.user_name].push({ date: row.date, entries: row.entries || [] });
  });
  return byUser;
}

/* ------------------------------------------------------------------ */
/*  カスタム種目                                                        */
/* ------------------------------------------------------------------ */

export async function getCustomExercises() {
  const { data, error } = await supabase.from("custom_exercises").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  const aerobic = data.filter((r) => r.type === "aerobic").map((r) => ({ id: r.id, name: r.name }));
  const weight = data
    .filter((r) => r.type === "weight")
    .map((r) => ({ id: r.id, name: r.name, bodyPart: r.body_part }));
  return { aerobic, weight };
}

export async function insertCustomExercise(type, name, bodyPart) {
  const { error } = await supabase.from("custom_exercises").insert({ type, name, body_part: bodyPart || null });
  if (error) throw error;
}

export async function deleteCustomExercise(id) {
  const { error } = await supabase.from("custom_exercises").delete().eq("id", id);
  if (error) throw error;
}

export async function moveCustomExerciseBodyPart(id, bodyPart) {
  const { error } = await supabase.from("custom_exercises").update({ body_part: bodyPart }).eq("id", id);
  if (error) throw error;
}
