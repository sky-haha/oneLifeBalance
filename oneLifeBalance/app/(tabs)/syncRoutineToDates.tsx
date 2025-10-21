// syncRoutineToDates.ts
import {
    collection, doc, getDoc, getDocs, onSnapshot,
    writeBatch
} from "firebase/firestore";
import { db } from "./firebaseConfig";

const WEEKDAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"] as const;
type Weekday = typeof WEEKDAYS[number];

function seoulTodayStart(): Date {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return new Date(`${ymd}T00:00:00+09:00`);
}
function addDaysKST(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}
function toISODateKST(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth()+1}`.padStart(2,"0");
  const day = `${d.getDate()}`.padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function targetDatesForWeekday(weekday: Weekday): string[] {
  const today0 = seoulTodayStart();
  const out: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = addDaysKST(today0, i);
    if (WEEKDAYS[d.getDay()] === weekday) out.push(toISODateKST(d));
  }
  return out;
}

async function mirrorOneDateFromRoutine(uid: string, weekday: Weekday, dateISO: string) {
  const weekdayDocRef = doc(db, `users/${uid}/routinTable/${weekday}`);
  const weekdaySnap = await getDoc(weekdayDocRef);
  const use = weekdaySnap.exists() && weekdaySnap.data().Use === true;

  const dateDocRef = doc(db, `users/${uid}/dateTable/${dateISO}`);
  const dateTimeTableCol = collection(dateDocRef, "timeTable");

  const batch = writeBatch(db);
  batch.set(dateDocRef, { Use: use }, { merge: true });

  if (!use) {
    const existing = await getDocs(dateTimeTableCol);
    existing.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return;
  }

  const routineCol = collection(db, `users/${uid}/routinTable/${weekday}/timeTable`);
  const [routineSnap, existingSnap] = await Promise.all([
    getDocs(routineCol), getDocs(dateTimeTableCol)
  ]);

  const existingIds = new Set(existingSnap.docs.map(d => d.id));
  const routineIds = new Set<string>();

  routineSnap.forEach(rdoc => {
    const rid = rdoc.id;
    routineIds.add(rid);
    const r = rdoc.data();
    const targetRef = doc(db, `users/${uid}/dateTable/${dateISO}/timeTable/${rid}`);
    batch.set(targetRef, {
      startTime: r.startTime,
      endTime: r.endTime,
      type: r.type,
      action: r.action,
      purpose: r.purpose,
      isGoal: r.isGoal,
      fix: r.fix ?? false,
    }, { merge: true });
  });

  existingIds.forEach(eid => {
    if (!routineIds.has(eid)) {
      batch.delete(doc(db, `users/${uid}/dateTable/${dateISO}/timeTable/${eid}`));
    }
  });

  await batch.commit();
}

export async function seedNext7DaysFromRoutine(uid: string) {
  const today0 = seoulTodayStart();
  for (let i = 1; i <= 7; i++) {
    const d = addDaysKST(today0, i);
    const dateISO = toISODateKST(d);
    const weekday = WEEKDAYS[d.getDay()];
    await mirrorOneDateFromRoutine(uid, weekday, dateISO);
  }
}

export function watchRoutineAndSync(uid: string) {
  const unsubs: Array<() => void> = [];

  WEEKDAYS.forEach((weekday) => {
    const unsubTimeTable = onSnapshot(
      collection(db, `users/${uid}/routinTable/${weekday}/timeTable`),
      async () => {
        const dates = targetDatesForWeekday(weekday);
        await Promise.all(dates.map(dateISO => mirrorOneDateFromRoutine(uid, weekday, dateISO)));
      }
    );

    const unsubUse = onSnapshot(
      doc(db, `users/${uid}/routinTable/${weekday}`),
      async () => {
        const dates = targetDatesForWeekday(weekday);
        await Promise.all(dates.map(dateISO => mirrorOneDateFromRoutine(uid, weekday, dateISO)));
      }
    );

    unsubs.push(() => unsubTimeTable());
    unsubs.push(() => unsubUse());
  });

  return () => {
    unsubs.forEach(fn => fn());
  };
}
