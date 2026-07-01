const { body, validationResult } = require('express-validator');
const { Team, User, Task, Milestone, Notification, TeamInvite } = require('../models');
const { runTeamFormation, scoreGroup } = require('../services/TeamFormationEngine');
const { predictTeamQuality, formatMembersForML } = require('../utils/mlClient');

function getTeamProgressFromTasks(tasks) {
  const total = tasks.length;
  if (total === 0) return 0;

  const completed = tasks.filter((task) => task.status === 'Completed').length;
  return Math.round((completed / total) * 100);
}

function getRiskLevelFromProgress(progress, existingRiskLevel, overdueMilestones = 0) {
  const normalizedRisk = existingRiskLevel?.toLowerCase?.() ?? 'unknown';
  if (normalizedRisk === 'high' || normalizedRisk === 'medium') return normalizedRisk;
  if (overdueMilestones > 0) return overdueMilestones > 1 ? 'high' : 'medium';
  if (progress < 20) return 'high';
  if (progress < 45) return 'medium';
  return 'low';
}

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation Error',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  return null;
};

/**
 * POST /api/v1/teams/formation/run
 */
const runFormation = async (req, res, next) => {
  try {
    const { minSize = 3, maxSize = 5, weights } = req.body;

    const result = await runTeamFormation({
      minSize,
      maxSize,
      weights,
      coordinatorId: req.user._id,
    });

    res.status(201).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/teams
 */
const getTeams = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [teams, total] = await Promise.all([
      Team.find(filter)
        .populate('members.user', 'fullName email studentId preferredRole avatar')
        .populate('assignedProject', 'title status')
        .populate('mentor', 'fullName email')
        .populate('proposedBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Team.countDocuments(filter),
    ]);

    const teamIds = teams.map((team) => team._id);
    const [tasks, milestones] = await Promise.all([
      Task.find({ team: { $in: teamIds } }).select('team status updatedAt createdAt'),
      Milestone.find({ team: { $in: teamIds } }).select('team status dueDate updatedAt'),
    ]);

    const tasksByTeam = new Map();
    for (const task of tasks) {
      const teamKey = task.team.toString();
      if (!tasksByTeam.has(teamKey)) tasksByTeam.set(teamKey, []);
      tasksByTeam.get(teamKey).push(task);
    }

    const milestonesByTeam = new Map();
    for (const milestone of milestones) {
      const teamKey = milestone.team.toString();
      if (!milestonesByTeam.has(teamKey)) milestonesByTeam.set(teamKey, []);
      milestonesByTeam.get(teamKey).push(milestone);
    }

    const enrichedTeams = teams.map((team) => {
      const teamKey = team._id.toString();
      const teamTasks = tasksByTeam.get(teamKey) ?? [];
      const teamMilestones = milestonesByTeam.get(teamKey) ?? [];
      const progress = getTeamProgressFromTasks(teamTasks);
      const overdueMilestones = teamMilestones.filter((milestone) => milestone.status === 'Overdue').length;
      const riskLevel = getRiskLevelFromProgress(progress, team.riskLevel, overdueMilestones);
      const riskFlags = [];

      if (teamTasks.length === 0) {
        riskFlags.push('No tasks created yet');
      } else if (progress < 45) {
        riskFlags.push('Low completion rate');
      }

      if (overdueMilestones > 0) {
        riskFlags.push(`${overdueMilestones} overdue milestone${overdueMilestones === 1 ? '' : 's'}`);
      }

      return {
        ...team.toObject(),
        progress,
        overallProgress: progress,
        completionRate: progress,
        progressPercentage: progress,
        riskLevel: team.riskLevel && team.riskLevel !== 'Unknown' ? team.riskLevel : riskLevel,
        riskScore: team.riskScore ?? Math.max(0, 100 - progress),
        riskFlags: team.riskFlags?.length ? team.riskFlags : riskFlags,
      };
    });

    res.status(200).json({
      success: true,
      count: enrichedTeams.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      data: enrichedTeams,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/teams/:id
 */
const getTeam = async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('members.user', 'fullName email studentId skills preferredRole avatar phone bio availableDays')
      .populate('assignedProject')
      .populate('mentor', 'fullName email phone')
      .populate('proposedBy', 'fullName email');

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    res.status(200).json({
      success: true,
      data: team,
    });
  } catch (error) {
    next(error);
  }
};

const updateTeamValidation = [
  body('name').optional().isString().trim(),
  body('status')
    .optional()
    .isIn(['Forming', 'Active', 'At Risk', 'Behind', 'Completed']),
  body('members').optional().isArray().withMessage('Members must be an array'),
  body('members.*.user').optional().isMongoId().withMessage('Valid user ID is required'),
  body('members.*.role').optional().isString().trim().withMessage('Valid role is required'),
];

const updateTeam = async (req, res, next) => {
  try {
    const validationError = handleValidation(req, res);
    if (validationError) return;

    const allowedFields = ['name', 'status', 'notes', 'mentor', 'members'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (req.body.mentor !== undefined) {
      const currentTeam = await Team.findById(req.params.id);
      if (currentTeam) {
        const memberIds = currentTeam.members.map(m => m.user);
        await User.updateMany(
          { _id: { $in: memberIds } },
          { $set: { assignedMentor: req.body.mentor } }
        );
      }
    }

    if (req.body.members !== undefined) {
      const currentTeam = await Team.findById(req.params.id);
      if (!currentTeam) {
        return res.status(404).json({ success: false, message: 'Team not found' });
      }

      const oldMemberIds = currentTeam.members.map(m => m.user.toString());
      const newMembers = req.body.members;
      const newMemberIds = newMembers.map(m => m.user.toString());

      // 1. Remove team reference from users removed from the team
      const removedMemberIds = oldMemberIds.filter(id => !newMemberIds.includes(id));
      if (removedMemberIds.length > 0) {
        await User.updateMany(
          { _id: { $in: removedMemberIds } },
          { $set: { team: null } }
        );
      }

      // 2. Add team reference to new users added to the team (removing from old teams if any)
      const addedMemberIds = newMemberIds.filter(id => !oldMemberIds.includes(id));
      if (addedMemberIds.length > 0) {
        for (const addedId of addedMemberIds) {
          const prevTeam = await Team.findOne({ 'members.user': addedId });
          if (prevTeam && prevTeam._id.toString() !== req.params.id) {
            prevTeam.members = prevTeam.members.filter(m => m.user.toString() !== addedId);
            await prevTeam.save();
          }
        }

        await User.updateMany(
          { _id: { $in: addedMemberIds } },
          { $set: { team: req.params.id } }
        );
      }

      updates.members = newMembers;

      // 3. Recalculate suitability score
      const users = await User.find({ _id: { $in: newMemberIds } });
      const scores = scoreGroup(users);
      updates.suitabilityScore = scores.suitabilityScore;

      // 4. Recalculate ML score using properly formatted members
      try {
        // Build member objects with role info for formatting
        const membersWithRoles = users.map(u => {
          const matchingMember = newMembers.find(m => m.user.toString() === u._id.toString());
          return { user: u, role: matchingMember ? matchingMember.role : '' };
        });
        const memberPayload = formatMembersForML(membersWithRoles);
        const ml = await predictTeamQuality(memberPayload, 0.7);
        updates.mlScore = ml.score;
        updates.mlLabel = ml.label;
      } catch (err) {
        console.warn('[ML Integration] Failed to enrich team with ML score on update:', err.message);
      }
    }

    const team = await Team.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('members.user', 'fullName email studentId skills preferredRole avatar phone bio availableDays')
      .populate('assignedProject', 'title')
      .populate('mentor', 'fullName email')
      .populate('proposedBy', 'fullName email');

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    res.status(200).json({
      success: true,
      data: team,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/teams/:id/override-roles
 */
const overrideRolesValidation = [
  body('roles').isArray().withMessage('Roles must be an array'),
  body('roles.*.user').notEmpty().withMessage('User ID is required'),
  body('roles.*.role').notEmpty().withMessage('Role is required'),
];

const overrideRoles = async (req, res, next) => {
  try {
    const validationError = handleValidation(req, res);
    if (validationError) return;

    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const { roles } = req.body;

    // Update roles for each specified member
    for (const roleUpdate of roles) {
      const member = team.members.find(
        (m) => m.user.toString() === roleUpdate.user
      );
      if (member) {
        member.role = roleUpdate.role;
      }
    }

    await team.save();

    const updatedTeam = await Team.findById(req.params.id)
      .populate('members.user', 'fullName email studentId')
      .populate('assignedProject', 'title');

    res.status(200).json({
      success: true,
      data: updatedTeam,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/teams/:id
 */
const deleteTeam = async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    // Nullify members' team field
    const memberIds = team.members.map((m) => m.user);
    await User.updateMany(
      { _id: { $in: memberIds } },
      { $set: { team: null, assignedMentor: null } }
    );

    await Team.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Team deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/teams/:id/workload
 */
const getTeamWorkload = async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id).populate(
      'members.user',
      'fullName email'
    );

    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const workload = [];

    for (const member of team.members) {
      const tasks = await Task.find({
        team: team._id,
        assignee: member.user._id,
      });

      const breakdown = {
        user: member.user,
        role: member.role,
        totalTasks: tasks.length,
        byStatus: {
          Backlog: tasks.filter((t) => t.status === 'Backlog').length,
          'To Do': tasks.filter((t) => t.status === 'To Do').length,
          'In Progress': tasks.filter((t) => t.status === 'In Progress').length,
          'Under Review': tasks.filter((t) => t.status === 'Under Review').length,
          Completed: tasks.filter((t) => t.status === 'Completed').length,
        },
        totalHoursLogged: tasks.reduce((sum, t) => sum + (t.hoursLogged || 0), 0),
      };

      workload.push(breakdown);
    }

    res.status(200).json({
      success: true,
      data: workload,
    });
  } catch (error) {
    next(error);
  }
};

const proposeTeamValidation = [
  body('name').notEmpty().withMessage('Team name is required').trim(),
  body('inviteIds')
    .isArray({ min: 2, max: 4 })
    .withMessage('You must have between 2 and 4 accepted invites to propose a team'),
  body('inviteIds.*').isMongoId().withMessage('Each invite ID must be a valid ID'),
];

const proposeTeam = async (req, res, next) => {
  try {
    const validationError = handleValidation(req, res);
    if (validationError) return;

    const { name, inviteIds } = req.body;

    if (req.user.team) {
      return res.status(400).json({ success: false, message: 'You are already in a team.' });
    }

    // Prevent double proposals for leader — only block on Proposed status
    // (Active/Completed teams are already blocked by the req.user.team check above)
    const leaderInProposed = await Team.findOne({ 'members.user': req.user._id, status: 'Proposed' });
    if (leaderInProposed) {
      return res.status(400).json({
        success: false,
        message: `You already have a pending proposal for team "${leaderInProposed.name}".`,
      });
    }

    const nameExists = await Team.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (nameExists) {
      return res.status(400).json({ success: false, message: `Team name "${name}" is already taken.` });
    }

    // Verify each invite: must belong to this leader AND be accepted
    // Deep-populate team inside the invitee so stale refs (deleted team docs) resolve to null
    const invites = await TeamInvite.find({
      _id: { $in: inviteIds },
      from: req.user._id,
      status: 'accepted',
    }).populate({
      path: 'to',
      select: 'fullName team',
      populate: { path: 'team', select: '_id name status' },
    });

    if (invites.length !== inviteIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some invites are not found, not accepted, or do not belong to you.',
      });
    }

    const finalMembers = [{ user: req.user._id, role: 'Project Manager' }];

    for (const inv of invites) {
      const student = inv.to;
      // student.team is null when: (a) never assigned, or (b) team doc was deleted (stale ObjectId)
      if (student.team) {
        return res.status(400).json({
          success: false,
          message: `${student.fullName} is already in a team ("${student.team.name}").`,
        });
      }
      // Double-check via the Team collection, but only against active/proposed statuses
      const alreadyInTeam = await Team.findOne({
        'members.user': student._id,
        status: { $in: ['Proposed', 'Forming', 'Active', 'At Risk', 'Behind'] },
      });
      if (alreadyInTeam) {
        return res.status(400).json({
          success: false,
          message: `${student.fullName} is already part of team "${alreadyInTeam.name}".`,
        });
      }
      finalMembers.push({ user: student._id, role: inv.role || 'Contributor' });
    }

    if (finalMembers.length < 3 || finalMembers.length > 5) {
      return res.status(400).json({ success: false, message: 'Teams must have between 3 and 5 members total (including you).' });
    }

    // Compute scores
    const userIds = finalMembers.map((m) => m.user);
    const users = await User.find({ _id: { $in: userIds } });
    const scores = scoreGroup(users);
    const suitabilityScore = scores.suitabilityScore;

    let mlScore = null;
    let mlLabel = null;
    try {
      const membersWithRoles = users.map((u) => {
        const matchingMember = finalMembers.find((m) => m.user.toString() === u._id.toString());
        return { user: u, role: matchingMember ? matchingMember.role : '' };
      });
      const memberPayload = formatMembersForML(membersWithRoles);
      const ml = await predictTeamQuality(memberPayload, 0.7);
      mlScore = ml.score;
      mlLabel = ml.label;
    } catch (err) {
      console.warn('[ML] Failed to get ML score on proposal:', err.message);
    }

    const team = await Team.create({
      name,
      members: finalMembers,
      proposedBy: req.user._id,
      status: 'Proposed',
      suitabilityScore,
      mlScore,
      mlLabel,
    });

    // Cancel all other pending invites from this leader and notify declined students
    await TeamInvite.updateMany(
      { from: req.user._id, status: 'pending' },
      { $set: { status: 'cancelled' } }
    );

    // Send a confirmation notification to accepted members
    const leaderName = req.user.fullName;
    const memberNotifications = invites.map((inv) => ({
      recipient: inv.to._id,
      type: 'team_invite',
      title: '🎉 Team proposal submitted!',
      body: `${leaderName} has submitted the team proposal for "${name}". Waiting for coordinator approval.`,
      meta: { status: 'proposal_submitted', teamName: name },
    }));
    if (memberNotifications.length > 0) {
      await Notification.insertMany(memberNotifications);
    }

    const populatedTeam = await Team.findById(team._id)
      .populate('members.user', 'fullName email studentId skills preferredRole avatar phone bio availableDays')
      .populate('assignedProject', 'title')
      .populate('mentor', 'fullName email')
      .populate('proposedBy', 'fullName email');

    res.status(201).json({ success: true, data: populatedTeam });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/teams/invite
 * Leader sends a team invitation to a student
 */
const sendTeamInvite = async (req, res, next) => {
  try {
    const { toUserId, role = 'Software Developer', proposedTeamName = '' } = req.body;

    if (!toUserId) {
      return res.status(400).json({ success: false, message: 'toUserId is required.' });
    }
    if (toUserId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot invite yourself.' });
    }

    // Leader must not already be in an approved/active team.
    // req.user.team is populated as an object { _id, name } by the auth middleware;
    // it is null if the user has no team or only a stale (deleted) team ref.
    if (req.user.team) {
      return res.status(400).json({ success: false, message: 'You are already in a team.' });
    }
    // Also block if the user already has a pending *Proposed* team (not yet approved).
    // Only check 'Proposed' status — Active/Completed teams are handled by the field above.
    const leaderInProposed = await Team.findOne({ 'members.user': req.user._id, status: 'Proposed' });
    if (leaderInProposed) {
      return res.status(400).json({
        success: false,
        message: `You already have a proposed team "${leaderInProposed.name}".`,
      });
    }

    // Validate recipient — populate team so stale refs (deleted team docs) resolve to null
    const recipient = await User.findById(toUserId).populate('team', '_id name status');
    if (!recipient || recipient.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }
    // recipient.team is null if: (a) never assigned, or (b) team document was deleted (stale ObjectId)
    if (recipient.team) {
      return res.status(400).json({ success: false, message: `${recipient.fullName} is already in a team.` });
    }
    // Also check if the recipient is listed in any active/proposed Team document
    const recipientInProposed = await Team.findOne({
      'members.user': toUserId,
      status: { $in: ['Proposed', 'Forming', 'Active', 'At Risk', 'Behind'] },
    });
    if (recipientInProposed) {
      return res.status(400).json({
        success: false,
        message: `${recipient.fullName} is already part of team "${recipientInProposed.name}".`,
      });
    }

    // Prevent duplicate pending invites from same leader to same student
    const existing = await TeamInvite.findOne({ from: req.user._id, to: toUserId, status: 'pending' });
    if (existing) {
      return res.status(400).json({ success: false, message: `You already sent a pending invite to ${recipient.fullName}.` });
    }

    // Count current pending+accepted invites from this leader
    const activeInviteCount = await TeamInvite.countDocuments({
      from: req.user._id,
      status: { $in: ['pending', 'accepted'] },
    });
    if (activeInviteCount >= 4) {
      return res.status(400).json({
        success: false,
        message: 'You can have at most 4 active invites (team size is 3–5 including you).',
      });
    }

    // Create the notification for the recipient
    const notification = await Notification.create({
      recipient: toUserId,
      type: 'team_invite',
      title: `📩 Team invitation from ${req.user.fullName}`,
      body: `${req.user.fullName} wants you to join their team${proposedTeamName ? ` "${proposedTeamName}"` : ''} as ${role}.`,
      meta: { inviteId: null, role, proposedTeamName, fromName: req.user.fullName, status: 'pending' },
    });

    // Create the invite record
    const invite = await TeamInvite.create({
      from: req.user._id,
      to: toUserId,
      role,
      proposedTeamName,
      notificationId: notification._id,
      status: 'pending',
    });

    // Patch the notification to carry the real inviteId
    notification.meta = { ...notification.meta, inviteId: invite._id.toString() };
    await notification.save();

    const populated = await TeamInvite.findById(invite._id)
      .populate('to', 'fullName email studentId avatar');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/teams/invite/:inviteId/respond
 * Invitee accepts or declines a team invite
 */
const respondToInvite = async (req, res, next) => {
  try {
    const { action } = req.body; // 'accept' | 'decline'
    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be "accept" or "decline".' });
    }

    const invite = await TeamInvite.findOne({ _id: req.params.inviteId, to: req.user._id });
    if (!invite) {
      return res.status(404).json({ success: false, message: 'Invite not found.' });
    }
    if (invite.status !== 'pending') {
      return res.status(400).json({ success: false, message: `This invite is already ${invite.status}.` });
    }

    // If accepting, check the student hasn't already accepted another invite
    if (action === 'accept') {
      const alreadyAccepted = await TeamInvite.findOne({ to: req.user._id, status: 'accepted' });
      if (alreadyAccepted) {
        return res.status(400).json({
          success: false,
          message: 'You have already accepted another team invitation. Decline it first.',
        });
      }
    }

    invite.status = action === 'accept' ? 'accepted' : 'declined';
    await invite.save();

    // Update the notification meta so the panel reflects the response
    if (invite.notificationId) {
      await Notification.findByIdAndUpdate(invite.notificationId, {
        read: true,
        'meta.status': invite.status,
      });
    }

    // Notify the leader of the decision
    const responder = req.user;
    await Notification.create({
      recipient: invite.from,
      type: 'team_invite',
      title: action === 'accept'
        ? `✅ ${responder.fullName} accepted your team invite!`
        : `❌ ${responder.fullName} declined your team invite.`,
      body: action === 'accept'
        ? `${responder.fullName} has joined your team. You can now add more members or submit your proposal.`
        : `${responder.fullName} declined. You can invite someone else.`,
      meta: { inviteId: invite._id.toString(), status: invite.status, fromName: responder.fullName },
    });

    res.status(200).json({ success: true, data: invite });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/teams/invite/pending
 * Returns all invites sent BY the current user (leader's dashboard)
 */
const getMyPendingInvites = async (req, res, next) => {
  try {
    const invites = await TeamInvite.find({ from: req.user._id })
      .populate('to', 'fullName email studentId avatar')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: invites });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/teams/invite/:inviteId
 * Leader cancels a pending invite they sent
 */
const cancelInvite = async (req, res, next) => {
  try {
    const invite = await TeamInvite.findOne({ _id: req.params.inviteId, from: req.user._id });
    if (!invite) {
      return res.status(404).json({ success: false, message: 'Invite not found.' });
    }
    if (invite.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Cannot cancel an invite that is already ${invite.status}.` });
    }
    invite.status = 'cancelled';
    await invite.save();
    // Update the notification so it no longer shows action buttons
    if (invite.notificationId) {
      await Notification.findByIdAndUpdate(invite.notificationId, {
        'meta.status': 'cancelled',
        read: true,
      });
    }
    res.status(200).json({ success: true, message: 'Invite cancelled.' });
  } catch (error) {
    next(error);
  }
};

const approveTeam = async (req, res, next) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    if (team.status !== 'Proposed') {
      return res.status(400).json({ success: false, message: 'This team is not pending approval.' });
    }

    const memberIds = team.members.map(m => m.user);
    const assignedUsers = await User.find({ _id: { $in: memberIds }, team: { $ne: null } }).populate('team');
    
    // Filter out users whose team reference is stale (null after populate) or points to the team being approved
    const activeAssignedUsers = assignedUsers.filter(u => u.team && u.team._id.toString() !== team._id.toString());
    
    if (activeAssignedUsers.length > 0) {
      const names = activeAssignedUsers.map(u => u.fullName).join(', ');
      return res.status(400).json({
        success: false,
        message: `Cannot approve. The following students are already assigned to a team: ${names}`,
      });
    }

    // Clean up stale team references on the users if any exist
    const staleUsers = assignedUsers.filter(u => !u.team);
    if (staleUsers.length > 0) {
      const staleUserIds = staleUsers.map(u => u._id);
      await User.updateMany({ _id: { $in: staleUserIds } }, { $set: { team: null } });
    }

    await User.updateMany(
      { _id: { $in: memberIds } },
      { $set: { team: team._id } }
    );

    team.status = 'Forming';

    const users = await User.find({ _id: { $in: memberIds } });
    const scores = scoreGroup(users);
    team.suitabilityScore = scores.suitabilityScore;

    try {
      // Build member objects with role info for proper formatting
      const membersWithRoles = users.map(u => {
        const matchingMember = team.members.find(m => m.user.toString() === u._id.toString());
        return { user: u, role: matchingMember ? matchingMember.role : '' };
      });
      const memberPayload = formatMembersForML(membersWithRoles);
      const ml = await predictTeamQuality(memberPayload, 0.7);
      team.mlScore = ml.score;
      team.mlLabel = ml.label;
    } catch (err) {
      console.warn('[ML Integration] Failed to enrich team with ML score on approval:', err.message);
    }

    await team.save();

    const populatedTeam = await Team.findById(team._id)
      .populate('members.user', 'fullName email studentId skills preferredRole avatar phone bio availableDays')
      .populate('assignedProject', 'title')
      .populate('mentor', 'fullName email')
      .populate('proposedBy', 'fullName email');

    res.status(200).json({
      success: true,
      data: populatedTeam,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  runFormation,
  getTeams,
  getTeam,
  updateTeam,
  updateTeamValidation,
  overrideRoles,
  overrideRolesValidation,
  deleteTeam,
  getTeamWorkload,
  proposeTeam,
  proposeTeamValidation,
  approveTeam,
  sendTeamInvite,
  respondToInvite,
  getMyPendingInvites,
  cancelInvite,
};
