// gptClient.ts
export type AutoTaskRequest = {
  dateISO: string;
  startMin: number;
  endMin: number;
  type: string;
  action: string;
  purpose?: string;
};

export type AutoTaskItem = {
  purpose: string;
  minutes: number;
};

export type AutoTaskResponse = {
  tasks: AutoTaskItem[];
};

function toHHMM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function suggestAutoTasks(req: AutoTaskRequest): Promise<AutoTaskResponse> {
   const apiKey =
  if (!apiKey) throw new Error("OpenAI API Key가 설정되지 않았습니다.");

  const spanMin = Math.max(0, req.endMin - req.startMin);
  if (spanMin <= 0) return { tasks: [] };

  // 120분(2시간)보다 짧으면 GPT까지 가지 않고 그대로 한 덩어리로 반환
  if (spanMin < 120) {
    return {
      tasks: [{ purpose: req.purpose || `${req.type}/${req.action}`, minutes: spanMin }],
    };
  }

  const system = `
당신은 일정 생성 보조 도우미입니다.
출력은 JSON만. 불필요한 설명 금지.
tasks 배열 안에 { "purpose": string, "minutes": number } 객체들만 생성.
minutes의 합은 반드시 ${spanMin} 이하.
각 minutes는 10~120 사이 권장.
type="${req.type}", action="${req.action}"의 활동 맥락에 맞는 목적(purpose)만 생성.
목적은 간결하고 실행가능하게(예: "준비운동", "유산소 러닝", "스트레칭 정리").
가능하면 120분(2시간) 단위로 묶어 계획하세요.
`;

  const user = `
날짜: ${req.dateISO}
시간: ${toHHMM(req.startMin)} ~ ${toHHMM(req.endMin)} (총 ${spanMin}분)
고정 조건: type="${req.type}", action="${req.action}"
맥락 purpose(참고용): ${req.purpose || "(없음)"}

요청:
- 시간 범위 안에서 수행할 구체적인 할 일을 2~5개 생성.
- minutes 합이 ${spanMin}분을 넘기지 않도록.
- 가능하면 120분(2시간) 단위로 계획하고, 부득이하면 하나의 조각만 120분 미만이 되도록.
- 아래 포맷으로만 응답:

{
  "tasks": [
    { "purpose": "string", "minutes": number },
    ...
  ]
}
`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI API 오류: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content || "{}";

  let parsed: AutoTaskResponse = { tasks: [] };
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { tasks: [] };
  }

  // 1) 1차 정리: 음수/이상치 제거, 총합이 spanMin 넘지 않도록
  const cleaned: AutoTaskItem[] = [];
  let total = 0;
  for (const t of parsed.tasks || []) {
    const mins = Math.max(5, Math.min(180, Math.floor(Number(t.minutes) || 0)));
    const purpose = String(t.purpose || "").trim();
    if (!purpose || mins <= 0) continue;
    if (total + mins > spanMin) break;
    cleaned.push({ purpose, minutes: mins });
    total += mins;
  }

  // 목적 후보가 비면 기본 목적 1개 확보
  const purposeSeed = req.purpose || `${req.type}/${req.action}`;
  const purposes = (cleaned.length ? cleaned.map(t => t.purpose) : [purposeSeed]).filter(Boolean);

  // 2) 2시간(120분) 선호 후처리:
  //    - spanMin을 최대한 120분 블록으로 쪼갬
  //    - remainder가 있으면 마지막에 하나만 120 미만으로 남김(또는 마지막 블록에 합침)
  const result: AutoTaskItem[] = [];
  let remain = spanMin;
  let idx = 0;

  // full 120분 블록들
  const numFull = Math.floor(remain / 120);
  for (let i = 0; i < numFull; i++) {
    const purpose = purposes[idx % purposes.length] || purposeSeed;
    result.push({ purpose, minutes: 120 });
    remain -= 120;
    idx++;
  }

  // 남은 시간이 있으면(0 < remain < 120) 하나의 블록으로 처리
  if (remain > 0) {
    const purpose = purposes[idx % purposes.length] || purposeSeed;
    // 만약 120 미만 블록이 안 보이는 문제가 있다면, 마지막 120에 합쳐 120+remain도 가능:
    // 여기서는 "왠만하면 2시간" 유지 + 남은 시간도 살리기 위해, 마지막 블록에 합치는 옵션 제공
    // 합치기: 마지막 블록이 있으면 minutes에 더해준다. 없으면 그대로 남김.
    if (result.length > 0) {
      result[result.length - 1] = {
        purpose: result[result.length - 1].purpose,
        minutes: result[result.length - 1].minutes + remain,
      };
    } else {
      // 전체가 120 미만인 경우(위에서 <120이면 리턴했으므로 이 경로는 거의 없음)
      result.push({ purpose, minutes: remain });
    }
    remain = 0;
  }

  return { tasks: result };
}
