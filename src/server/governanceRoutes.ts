/**
 * Approval queue and spending policy.
 */
import { Router, Request, Response } from 'express';
import { q, selectRows, ensureStoreReady, timestamp, parseJson } from './store';
import {
  getPolicy, setPolicy, requestApproval, decideApproval,
  pendingApprovalFor, latestApprovalFor, spendStatus
} from './governance';
import { asyncHandler, badRequest, notFound, requireParam, currentUserId, HttpError } from './http';
import { requireOwnedBrand, requireUser, audit } from './authMiddleware';

const router = Router();

/* ------------------------------------------------------------------ */
/* Policy                                                              */
/* ------------------------------------------------------------------ */

router.get('/policy', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const [policy, spend] = await Promise.all([getPolicy(brandId), spendStatus(brandId)]);
  res.json({ policy, spend });
}));

router.put('/policy', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const user = requireUser(req);

  const policy = await setPolicy(brandId, {
    requireApproval: req.body.requireApproval,
    approverRole: req.body.approverRole,
    dailySpendCap: req.body.dailySpendCap,
    monthlySpendCap: req.body.monthlySpendCap,
    maxCampaignDailyBudget: req.body.maxCampaignDailyBudget,
    spendAlertThreshold: req.body.spendAlertThreshold,
    blockOnCap: req.body.blockOnCap
  }, user.id);

  audit(req, { action: 'policy.update', targetType: 'brand', targetId: brandId, brandId, detail: policy });
  res.json({ success: true, policy });
}));

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */

const postOr404 = async (postId: string) => {
  const rows = await q<any>('SELECT * FROM posts WHERE id = $1', [postId]);
  if (!rows.length) throw notFound('That post does not exist.');
  return rows[0];
};

/** Everything waiting on a decision, newest first. */
router.get('/approvals', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  await ensureStoreReady();

  const rows = await selectRows<any>(
    'approvals', 'brand_id = $1', [brandId], 'ORDER BY requested_at DESC LIMIT 200'
  );

  // The post is what a reviewer actually reads, so it travels with the request.
  const withPosts = await Promise.all(rows.map(async row => {
    const post = (await q<any>('SELECT * FROM posts WHERE id = $1', [row.post_id]))[0];
    return {
      id: row.id,
      postId: row.post_id,
      decision: row.decision,
      comment: row.comment,
      requestedBy: row.requested_by,
      reviewerEmail: row.reviewer_email,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
      post: post ? {
        content: post.content,
        mediaUrl: post.media_url,
        mediaType: post.media_type,
        platforms: parseJson<string[]>(post.platforms, []),
        scheduledTime: post.scheduled_time,
        status: post.status
      } : null
    };
  }));

  res.json({
    approvals: withPosts,
    pending: withPosts.filter(a => a.decision === 'pending').length
  });
}));

router.post('/approvals', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const userId = currentUserId(req);
  const postId = requireParam(req.body.postId, 'postId');

  const post = await postOr404(postId);
  if (post.brand_id !== brandId) throw notFound('That post does not exist.');
  if (['published', 'publishing'].includes(post.status)) {
    throw badRequest('That post has already gone out.');
  }

  const approval = await requestApproval({ postId, brandId, requestedBy: userId });
  audit(req, { action: 'approval.request', targetType: 'post', targetId: postId, brandId });

  res.json({ success: true, approval, message: 'Sent for review.' });
}));

router.post('/approvals/:postId/decide', asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const postId = req.params.postId;

  const post = await postOr404(postId);
  req.body = { ...(req.body || {}), brandId: post.brand_id };
  await requireOwnedBrand(req);

  if (typeof req.body.approve !== 'boolean') {
    throw badRequest('`approve` must be true or false.');
  }
  if (req.body.approve === false && !String(req.body.comment || '').trim()) {
    // A rejection without a reason gives the author nothing to act on.
    throw badRequest('Say why you are rejecting it, so the author knows what to change.');
  }

  const result = await decideApproval({
    postId,
    reviewer: { id: user.id, email: user.email, role: user.role },
    approve: req.body.approve,
    comment: req.body.comment
  });

  audit(req, {
    action: req.body.approve ? 'approval.approve' : 'approval.reject',
    targetType: 'post', targetId: postId, brandId: post.brand_id,
    detail: { comment: req.body.comment }
  });

  res.json({
    success: true,
    approval: result.approval,
    postStatus: result.postStatus,
    message: req.body.approve
      ? result.postStatus === 'scheduled'
        ? 'Approved. It will go out at its scheduled time.'
        : 'Approved. Give it a time to schedule it.'
      : 'Rejected. The author can revise and resubmit.'
  });
}));

/** What a given post needs before it can go out. */
router.get('/approvals/:postId', asyncHandler(async (req: Request, res: Response) => {
  const post = await postOr404(req.params.postId);
  req.query = { ...req.query, brandId: post.brand_id };
  await requireOwnedBrand(req);

  const [policy, pending, latest] = await Promise.all([
    getPolicy(post.brand_id),
    pendingApprovalFor(req.params.postId),
    latestApprovalFor(req.params.postId)
  ]);

  res.json({
    requiresApproval: policy.requireApproval,
    pending,
    latest,
    publishable: !policy.requireApproval || latest?.decision === 'approved'
  });
}));

/* ------------------------------------------------------------------ */
/* Spend                                                               */
/* ------------------------------------------------------------------ */

router.get('/spend', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const status = await spendStatus(brandId);

  const recent = await selectRows<any>(
    'spend_events', 'brand_id = $1', [brandId], 'ORDER BY recorded_for DESC LIMIT 60'
  );

  res.json({
    status,
    byDay: recent.map(r => ({
      date: r.recorded_for,
      campaignId: r.campaign_id,
      amount: Number(r.amount),
      currency: r.currency
    }))
  });
}));

export default router;
