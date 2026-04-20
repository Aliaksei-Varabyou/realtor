export type MeetingType = "mortgage" | "consultation";
export type City = "wroclaw" | "warsaw" | "other";
export type CalendarSlot = "calendar1" | "calendar2" | "calendar3";

export function resolveCalendarSlots(meetingType: MeetingType, city: City): CalendarSlot[] {
  if (meetingType === "consultation" || city === "other") {
    return ["calendar1"];
  }
  if (meetingType === "mortgage" && city === "wroclaw") {
    return ["calendar1", "calendar2"];
  }
  return ["calendar1", "calendar3"];
}
