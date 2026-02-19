import { NextRequest, NextResponse } from "next/server";
import { getCalendarClient } from "@/lib/google-oauth";
import type { ScheduleEntry } from "@/types";

export async function GET(request: NextRequest) {
  const tokens = request.cookies.get("google_calendar_tokens")?.value;
  if (!tokens) {
    return NextResponse.json({ error: "未認証です" }, { status: 401 });
  }

  const date = request.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "dateパラメータが必要です" }, { status: 400 });
  }

  try {
    const calendar = getCalendarClient(tokens);
    const timeMin = new Date(`${date}T00:00:00+09:00`).toISOString();
    const timeMax = new Date(`${date}T23:59:59+09:00`).toISOString();

    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = (res.data.items || []).map((e) => ({
      id: e.id,
      summary: e.summary || "",
      start: e.start?.dateTime || e.start?.date || "",
      end: e.end?.dateTime || e.end?.date || "",
      description: e.description || "",
    }));

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Calendar read error:", error);
    return NextResponse.json(
      { error: "カレンダーの取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const tokens = request.cookies.get("google_calendar_tokens")?.value;
  if (!tokens) {
    return NextResponse.json({ error: "未認証です" }, { status: 401 });
  }

  try {
    const { entries, date } = (await request.json()) as {
      entries: ScheduleEntry[];
      date: string;
    };

    const calendar = getCalendarClient(tokens);
    const results: { title: string; eventId: string }[] = [];

    for (const entry of entries) {
      const startDateTime = `${date}T${entry.startTime}:00+09:00`;
      const endDateTime = `${date}T${entry.endTime}:00+09:00`;

      const res = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: entry.title,
          description: entry.description || undefined,
          start: { dateTime: startDateTime, timeZone: "Asia/Tokyo" },
          end: { dateTime: endDateTime, timeZone: "Asia/Tokyo" },
        },
      });

      results.push({
        title: entry.title,
        eventId: res.data.id || "",
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Calendar write error:", error);
    return NextResponse.json(
      { error: "カレンダーへの登録に失敗しました" },
      { status: 500 }
    );
  }
}
