/**
 * Brand policy: who has to approve content, and how much may be spent.
 *
 * Both were missing. Anyone with access could publish straight to a client's
 * audience with no second pair of eyes, and the only spending control was
 * that campaigns were created paused — which stops nothing once one is
 * running.
 */
import { q, saveRow, selectRows, ensureStoreReady, timestamp, num } from './store';
import { randomId } from './crypto';
import { logger } from './logging';
import { HttpError } from './http';

export interface BrandPolicy {
  brandId: string;
  requireApproval: boolean;
  approverRole: string;
  dailySpendCap: number | null;
  monthlySpendCap: number | null;
  maxCampaignDailyBudget: number | null;
  /** Fraction of a cap at which to warn, e.g. 0.8 for 80%. */
  spendAlertThreshold: number;
  /** Whether reaching a cap blocks activation or only warns. */
  blockOnCap: boolean;
  updatedAt?: string;
}

const DEFAULTS: Omit<BrandPolicy, 'brandId'> = {
  requireApproval: false,
  approverRole: 'admin',
  dailySpendCap: null,
  monthlySpendCap: null,
  maxCampaignDailyBudget: null,
  spendAlertThreshold: 0.8,
  blockOnCap: true
};

const optionalNumber = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const getPolicy = async (brandId: string): Promise<BrandPolicy> => {
  await ensureStoreReady();
  const rows = await selectRows<any>('brand_policies', 'brand_id = $1', [brandId]);
  if (!rows.length) return { brandId, ...DEFAULTS };

  const row = rows[0];
  return {
    brandId,
    requireApproval: row.require_approval === '1',
    approverRole: row.approver_role || 'admin',
    dailySpendCap: optionalNumber(row.daily_spend_cap),
    monthlySpendCap: optionalNumber(row.monthly_spend_cap),
    maxCampaignDailyBudget: optionalNumber(row.max_campaign_daily_budget),
    spendAlertThreshold: Number(row.spend_alert_threshold ?? 0.8),
    blockOnCap: row.block_on_cap !== '0',
    updatedAt: row.updated_at
  };
};

export const setPolicy = async (
  brandId: string,
  patch: Partial<BrandPolicy>,
  updatedBy: string
): Promise<BrandPolicy> => {
  const current = await getPolicy(brandId);

  // Spreading the patch directly would let an absent field overwrite a set one
  // with undefined: someone setting only a spend cap would silently turn off
  // approval and cap blocking too.
  const supplied = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Partial<BrandPolicy>;
  const next = { ...current, ...supplied };

  if (next.spendAlertThreshold <= 0 || next.spendAlertThreshold > 1) {
    throw new HttpError(400, 'The spend alert threshold must be a fraction between 0 and 1, for example 0.8 for 80%.');
  }
  for (const [label, value] of [
    ['daily spend cap', next.dailySpendCap],
    ['monthly spend cap', next.monthlySpendCap],
    ['maximum campaign daily budget', next.maxCampaignDailyBudget]
  ] as const) {
    if (value !== null && value <= 0) throw new HttpError(400, `The ${label} must be greater than zero, or left unset.`);
  }
  if (next.dailySpendCap && next.monthlySpendCap && next.dailySpendCap > next.monthlySpendCap) {
    throw new HttpError(400, 'The daily cap cannot be higher than the monthly cap.');
  }

  await saveRow('brand_policies', {
    brand_id: brandId,
    require_approval: next.requireApproval ? '1' : '0',
    approver_role: next.approverRole,
    daily_spend_cap: next.dailySpendCap ?? '',
    monthly_spend_cap: next.monthlySpendCap ?? '',
    max_campaign_daily_budget: next.maxCampaignDailyBudget ?? '',
    spend_alert_threshold: String(next.spendAlertThreshold),
    block_on_cap: next.blockOnCap ? '1' : '0',
    updated_by: updatedBy,
    updated_at: timestamp()
  }, 'brand_id');

  return getPolicy(brandId);
};

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */

export type PostStatus =
  | 'suggested' | 'pending_review' | 'approved' | 'rejected'
  | 'scheduled' | 'publishing' | 'published' | 'failed';

export interface ApprovalRecord {
  id: string;
  postId: string;
  brandId: string;
  requestedBy: string;
  reviewerId?: string;
  reviewerEmail?: string;
  decision: 'pending' | 'approved' | 'rejected';
  comment?: string;
  requestedAt: string;
  decidedAt?: string;
}

const rowToApproval = (row: any): ApprovalRecord => ({
  id: row.id,
  postId: row.post_id,
  brandId: row.brand_id,
  requestedBy: row.requested_by,
  reviewerId: row.reviewer_id || undefined,
  reviewerEmail: row.reviewer_email || undefined,
  decision: (row.decision || 'pending') as ApprovalRecord['decision'],
  comment: row.comment || undefined,
  requestedAt: row.requested_at,
  decidedAt: row.decided_at || undefined
});

/** The open request for a post, if one exists. */
export const pendingApprovalFor = async (postId: string): Promise<ApprovalRecord | null> => {
  const rows = await selectRows<any>(
    'approvals', "post_id = $1 AND decision = 'pending'", [postId], 'ORDER BY requested_at DESC'
  );
  return rows.length ? rowToApproval(rows[0]) : null;
};

export const latestApprovalFor = async (postId: string): Promise<ApprovalRecord | null> => {
  const rows = await selectRows<any>('approvals', 'post_id = $1', [postId], 'ORDER BY requested_at DESC');
  return rows.length ? rowToApproval(rows[0]) : null;
};

export const requestApproval = async (params: {
  postId: string;
  brandId: string;
  requestedBy: string;
}): Promise<ApprovalRecord> => {
  await ensureStoreReady();

  // Re-submitting an already-open request should not create a second one.
  const open = await pendingApprovalFor(params.postId);
  if (open) return open;

  const id = randomId('appr');
  await saveRow('approvals', {
    id,
    post_id: params.postId,
    brand_id: params.brandId,
    requested_by: params.requestedBy,
    decision: 'pending',
    requested_at: timestamp()
  });

  await q(`UPDATE posts SET status = 'pending_review', updated_at = $1 WHERE id = $2`,
    [timestamp(), params.postId]);

  logger.info('approval requested', { postId: params.postId, brandId: params.brandId });
  return (await pendingApprovalFor(params.postId))!;
};

export const decideApproval = async (params: {
  postId: string;
  reviewer: { id: string; email: string; role: string };
  approve: boolean;
  comment?: string;
}): Promise<{ approval: ApprovalRecord; postStatus: PostStatus }> => {
  await ensureStoreReady();

  const open = await pendingApprovalFor(params.postId);
  if (!open) throw new HttpError(404, 'There is no review open for this post.');

  const policy = await getPolicy(open.brandId);

  // Reviewing your own work defeats the point of review.
  if (open.requestedBy === params.reviewer.id) {
    throw new HttpError(403, 'You cannot approve a post you submitted yourself. Ask another reviewer.');
  }
  if (policy.approverRole !== 'any' && params.reviewer.role !== policy.approverRole) {
    throw new HttpError(403, `Approving content needs the ${policy.approverRole} role.`);
  }

  const decision = params.approve ? 'approved' : 'rejected';
  const now = timestamp();

  await q(
    `UPDATE approvals SET decision = $1, reviewer_id = $2, reviewer_email = $3, comment = $4, decided_at = $5
      WHERE id = $6`,
    [decision, params.reviewer.id, params.reviewer.email, (params.comment || '').slice(0, 1000), now, open.id]
  );

  // An approved post returns to scheduled only if it carries a time; without
  // one it waits as approved until somebody schedules it.
  const post = (await q<any>('SELECT scheduled_time FROM posts WHERE id = $1', [params.postId]))[0];
  const postStatus: PostStatus = params.approve
    ? (post?.scheduled_time ? 'scheduled' : 'approved')
    : 'rejected';

  await q(`UPDATE posts SET status = $1, updated_at = $2 WHERE id = $3`, [postStatus, now, params.postId]);

  logger.info('approval decided', {
    postId: params.postId, decision, reviewerId: params.reviewer.id
  });

  return { approval: (await latestApprovalFor(params.postId))!, postStatus };
};

/**
 * Whether a post may go out.
 *
 * Checked by the publisher rather than only at the UI, because a post can
 * reach the scheduler without ever passing through the interface — through
 * the API, or through an agent.
 */
export const assertPublishable = async (post: { id: string; brand_id: string }): Promise<void> => {
  const policy = await getPolicy(post.brand_id);
  if (!policy.requireApproval) return;

  const approval = await latestApprovalFor(post.id);
  if (!approval || approval.decision !== 'approved') {
    throw new HttpError(
      403,
      approval?.decision === 'rejected'
        ? 'This post was rejected in review and cannot be published.'
        : 'This brand requires approval before publishing, and this post has not been approved.'
    );
  }
};

/* ------------------------------------------------------------------ */
/* Spend                                                               */
/* ------------------------------------------------------------------ */

const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);
const monthKey = (date = new Date()) => date.toISOString().slice(0, 7);

/**
 * Records spend for a campaign on a given day.
 *
 * Keyed on brand, campaign and day so re-reading the same insights window
 * updates the figure rather than adding to it — Meta restates recent days as
 * attribution settles.
 */
export const recordSpend = async (params: {
  brandId: string;
  campaignId: string;
  amount: number;
  currency: string;
  forDate: string;
}): Promise<void> => {
  await ensureStoreReady();
  await saveRow('spend_events', {
    id: `spend_${params.brandId}_${params.campaignId}_${params.forDate}`,
    brand_id: params.brandId,
    campaign_id: params.campaignId,
    amount: String(params.amount),
    currency: params.currency,
    recorded_for: params.forDate,
    source: 'meta',
    created_at: timestamp()
  });
};

export interface SpendStatus {
  today: number;
  month: number;
  currency: string;
  dailyCap: number | null;
  monthlyCap: number | null;
  dailyRemaining: number | null;
  monthlyRemaining: number | null;
  /** 'ok' | 'approaching' | 'exceeded' */
  state: 'ok' | 'approaching' | 'exceeded';
  messages: string[];
}

export const spendStatus = async (brandId: string): Promise<SpendStatus> => {
  await ensureStoreReady();
  const policy = await getPolicy(brandId);

  const rows = await selectRows<any>('spend_events', 'brand_id = $1', [brandId]);
  const today = rows
    .filter(r => r.recorded_for === dayKey())
    .reduce((sum, r) => sum + num(r.amount), 0);
  const month = rows
    .filter(r => String(r.recorded_for || '').startsWith(monthKey()))
    .reduce((sum, r) => sum + num(r.amount), 0);

  const currency = rows[0]?.currency || 'USD';
  const messages: string[] = [];
  let state: SpendStatus['state'] = 'ok';

  const check = (label: string, spent: number, cap: number | null) => {
    if (!cap) return;
    if (spent >= cap) {
      state = 'exceeded';
      messages.push(`${label} spend of ${spent.toFixed(2)} ${currency} has reached the ${cap} cap.`);
    } else if (spent >= cap * policy.spendAlertThreshold && state !== 'exceeded') {
      state = 'approaching';
      messages.push(
        `${label} spend of ${spent.toFixed(2)} ${currency} is ${Math.round((spent / cap) * 100)}% of the ${cap} cap.`
      );
    }
  };

  check('Today’s', today, policy.dailySpendCap);
  check('This month’s', month, policy.monthlySpendCap);

  return {
    today,
    month,
    currency,
    dailyCap: policy.dailySpendCap,
    monthlyCap: policy.monthlySpendCap,
    dailyRemaining: policy.dailySpendCap === null ? null : Math.max(0, policy.dailySpendCap - today),
    monthlyRemaining: policy.monthlySpendCap === null ? null : Math.max(0, policy.monthlySpendCap - month),
    state,
    messages
  };
};

/**
 * Gate on anything that would start or increase spend.
 *
 * Returns the warnings to surface when the brand is near a cap, and throws
 * when it is past one and the policy says to block. Creating a paused
 * campaign is always allowed — only activation and budget are restricted.
 */
export const assertSpendAllowed = async (params: {
  brandId: string;
  dailyBudget?: number;
  activating: boolean;
}): Promise<{ warnings: string[]; status: SpendStatus }> => {
  const policy = await getPolicy(params.brandId);
  const status = await spendStatus(params.brandId);
  const warnings: string[] = [];

  if (policy.maxCampaignDailyBudget && params.dailyBudget && params.dailyBudget > policy.maxCampaignDailyBudget) {
    throw new HttpError(
      403,
      `A daily budget of ${params.dailyBudget} exceeds this brand's per-campaign limit of ` +
      `${policy.maxCampaignDailyBudget}. Raise the limit in the brand's spending policy, or lower the budget.`
    );
  }

  if (params.activating && status.state === 'exceeded') {
    if (policy.blockOnCap) {
      throw new HttpError(
        403,
        `${status.messages[0]} Activating more delivery is blocked until the cap is raised or the period rolls over.`
      );
    }
    warnings.push(...status.messages);
  } else if (status.state === 'approaching') {
    warnings.push(...status.messages);
  }

  // A new daily budget that would itself breach the remaining allowance is
  // worth flagging before it runs, not after.
  if (params.activating && params.dailyBudget && status.dailyRemaining !== null
      && params.dailyBudget > status.dailyRemaining) {
    warnings.push(
      `A daily budget of ${params.dailyBudget} is more than the ${status.dailyRemaining.toFixed(2)} ` +
      `${status.currency} left under today's cap.`
    );
  }

  return { warnings, status };
};
