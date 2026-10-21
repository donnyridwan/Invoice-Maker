"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { isEmailEnabled } from "@/lib/email";
import { todayInJakarta } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import {
  createSchedule,
  deleteSchedule,
  getScheduleContext,
  pauseSchedule,
  resumeSchedule,
  updateSchedule,
} from "./queries";
import { toScheduleView, type ScheduleView } from "./schedule-summary";
import type { RecurringScheduleInput } from "./schema";

/** The list, the detail page, the editor and the recurring tab all show schedules. */
function revalidateSchedulePages(): void {
  revalidatePath("/invoices", "layout");
}

async function run<T>(work: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  try {
    const data = await work(user.id);
    revalidateSchedulePages();
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

export type ScheduleDialogData = {
  schedule: ScheduleView | null;
  /** Automatic email needs a verified account, a configured transport and a client with an address. */
  emailVerified: boolean;
  emailEnabled: boolean;
  clientEmail: string | null;
  today: string;
};

/** Everything the schedule dialog needs, read fresh when it opens (after the editor flushed its changes). */
export async function getScheduleDialogDataAction(invoiceId: string): Promise<ActionResult<ScheduleDialogData>> {
  const user = await requireUser();
  try {
    const { schedule, clientEmail } = await getScheduleContext(user.id, invoiceId);
    return {
      ok: true,
      data: {
        schedule: schedule ? toScheduleView(schedule) : null,
        emailVerified: user.emailVerified,
        emailEnabled: isEmailEnabled(),
        clientEmail,
        today: todayInJakarta(),
      },
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createScheduleAction(invoiceId: string, input: RecurringScheduleInput): Promise<ActionResult> {
  return run(async (userId) => {
    await createSchedule(userId, invoiceId, input);
  });
}

export async function updateScheduleAction(id: string, input: RecurringScheduleInput): Promise<ActionResult> {
  return run(async (userId) => {
    await updateSchedule(userId, id, input);
  });
}

export async function pauseScheduleAction(id: string): Promise<ActionResult> {
  return run(async (userId) => {
    await pauseSchedule(userId, id);
  });
}

export async function resumeScheduleAction(id: string): Promise<ActionResult> {
  return run(async (userId) => {
    await resumeSchedule(userId, id);
  });
}

export async function deleteScheduleAction(id: string): Promise<ActionResult> {
  return run(async (userId) => {
    await deleteSchedule(userId, id);
  });
}
