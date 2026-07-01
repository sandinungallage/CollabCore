const { User, Team, Task, Milestone } = require('../models');

function getTeamProgressFromTasks(tasks) {
  const total = tasks.length;
  if (total === 0) return 0;

  const completed = tasks.filter((task) => task.status === 'Completed').length;
  return Math.round((completed / total) * 100);
}

function getRiskLevelFromProgress(progress, existingRiskLevel) {
  const normalizedRisk = existingRiskLevel?.toLowerCase?.() ?? 'unknown';
  if (normalizedRisk === 'high' || normalizedRisk === 'medium') return normalizedRisk;
  if (progress < 20) return 'high';
  if (progress < 45) return 'medium';
  return 'low';
}

/**
 * GET /api/v1/mentors
 * Get all mentors
 */
const getMentors = async (req, res, next) => {
  try {
    const mentors = await User.find({ role: 'mentor', active: { $ne: false } })
      .select('fullName email phone faculty bio avatar');

    res.status(200).json({
      success: true,
      count: mentors.length,
      data: mentors,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/mentors/:mentorId/teams
 * Get teams for a mentor
 */
const getMentorTeams = async (req, res, next) => {
  try {
    const { mentorId } = req.params;

    const mentor = await User.findById(mentorId);
    if (!mentor || mentor.role !== 'mentor') {
      return res.status(404).json({
        success: false,
        message: 'Mentor not found',
      });
    }

    const teams = await Team.find({ mentor: mentorId })
      .populate('members.user', 'fullName email studentId')
      .populate('assignedProject', 'title status');

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
      const riskLevel = getRiskLevelFromProgress(progress, team.riskLevel);
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
      data: enrichedTeams,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/mentors/:mentorId/assign-team/:teamId
 * Coordinator assigns a team to a mentor
 */
const assignTeamToMentor = async (req, res, next) => {
  try {
    const { mentorId, teamId } = req.params;

    const mentor = await User.findById(mentorId);
    if (!mentor || mentor.role !== 'mentor') {
      return res.status(404).json({
        success: false,
        message: 'Mentor not found',
      });
    }

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found',
      });
    }

    // Assign mentor to team
    team.mentor = mentorId;
    await team.save();

    // Update all team members to have this mentor assigned
    const memberIds = team.members.map((m) => m.user);
    await User.updateMany(
      { _id: { $in: memberIds } },
      { $set: { assignedMentor: mentorId } }
    );

    // Send notifications to mentor and students
    const Notification = require('../models/Notification');

    await Notification.create({
      recipient: mentorId,
      type: 'system',
      title: 'New Team Assignment',
      body: `You have been assigned as the mentor for team "${team.name}".`,
      link: '/mentor/dashboard',
    });

    for (const studentId of memberIds) {
      await Notification.create({
        recipient: studentId,
        type: 'system',
        title: 'Mentor Assigned',
        body: `Mentor "${mentor.fullName}" has been assigned to your team "${team.name}".`,
        link: '/student/team',
      });
    }

    const updatedTeam = await Team.findById(teamId)
      .populate('members.user', 'fullName email')
      .populate('mentor', 'fullName email');

    res.status(200).json({
      success: true,
      message: 'Team assigned to mentor successfully',
      data: updatedTeam,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMentors,
  getMentorTeams,
  assignTeamToMentor,
};
