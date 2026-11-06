"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { isEmailEnabled } from "@/lib/email";
import { todayInJakarta } from "@/lib/dates";
import { requireWorkspace } from "@/lib/workspace";
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

async function run<T>(work: (workspaceId: string, userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const { user, workspaceId } = await requireWorkspace();
  try {
    const data = await work(workspaceId, user.id);
    revalidateSchedulePages();
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

export type ScheduleDialogData = {
  schedule: ScheduleView | null;
  /** Automatic email goes out from the member who last saved the schedule: it needs their verified account, a configured transport and a client with an address. */
  emailVerified: boolean;
  emailEnabled: boolean;
  clientEmail: string | null;
  today: string;
};

/** Everything the schedule dialog needs, read fresh when it opens (after the editor flushed its changes). */
export async function getScheduleDialogDataAction(invoiceId: string): Promise<ActionResult<ScheduleDialogData>> {
  const { user, workspaceId } = await requireWorkspace();
  try {
    const { schedule, clientEmail } = await getScheduleContext(workspaceId, invoiceId);
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
  return run(async (workspaceId, userId) => {
    await createSchedule(workspaceId, invoiceId, input, userId);
  });
}

export async function updateScheduleAction(id: string, input: RecurringScheduleInput): Promise<ActionResult> {
  return run(async (workspaceId, userId) => {
    await updateSchedule(workspaceId, id, input, userId);
  });
}

export async function pauseScheduleAction(id: string): Promise<ActionResult> {
  return run(async (workspaceId) => {
    await pauseSchedule(workspaceId, id);
  });
}

export async function resumeScheduleAction(id: string): Promise<ActionResult> {
  return run(async (workspaceId) => {
    await resumeSchedule(workspaceId, id);
  });
}

export async function deleteScheduleAction(id: string): Promise<ActionResult> {
  return run(async (workspaceId) => {
    await deleteSchedule(workspaceId, id);
  });
}
