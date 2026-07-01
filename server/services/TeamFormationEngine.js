const { User, Team } = require('../models');
const { predictTeamQuality, formatMembersForML } = require('../utils/mlClient');

// Word lists for auto-generated team names
const adjectives = [
  'Swift', 'Brave', 'Bright', 'Noble', 'Bold', 'Cosmic', 'Stellar', 'Quantum',
  'Phoenix', 'Thunder', 'Crystal', 'Golden', 'Silver', 'Iron', 'Rapid',
  'Dynamic', 'Agile', 'Electric', 'Digital', 'Cyber', 'Alpha', 'Omega',
  'Prime', 'Apex', 'Hyper', 'Ultra', 'Mega', 'Super', 'Turbo', 'Fusion',
  'Blazing', 'Rising', 'Soaring', 'Radiant', 'Infinite', 'Mystic', 'Astral',
  'Lunar', 'Solar', 'Titan',
];

const nouns = [
  'Wolves', 'Eagles', 'Hawks', 'Lions', 'Panthers', 'Falcons', 'Dragons',
  'Vikings', 'Spartans', 'Titans', 'Pioneers', 'Rangers', 'Coders',
  'Builders', 'Innovators', 'Hackers', 'Makers', 'Crafters', 'Voyagers',
  'Explorers', 'Knights', 'Guardians', 'Sentinels', 'Strikers', 'Rockets',
  'Comets', 'Nebulas', 'Quasars', 'Pulsars', 'Photons', 'Protons',
  'Electrons', 'Vectors', 'Matrices', 'Nodes', 'Stacks', 'Bytes',
  'Pixels', 'Modules', 'Kernels',
];

/**
 * Fisher-Yates shuffle
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generate a unique team name
 */
async function generateTeamName() {
  let name;
  let attempts = 0;
  do {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    name = `Team ${adj} ${noun}`;
    const exists = await Team.findOne({ name });
    if (!exists) return name;
    attempts++;
  } while (attempts < 100);
  // Fallback with timestamp
  return `Team ${Date.now()}`;
}

/**
 * Score a group of students
 */
function scoreGroup(members, weights) {
  const w = {
    skillDiversity: weights?.skillDiversity ?? 0.4,
    availability: weights?.availability ?? 0.3,
    roleCoverage: weights?.roleCoverage ?? 0.3,
  };

  // Skill diversity: unique skills / total possible
  const allSkillNames = new Set();
  const memberSkills = new Set();
  members.forEach((m) => {
    if (m.skills) {
      m.skills.forEach((s) => {
        allSkillNames.add(s.name);
        memberSkills.add(s.name);
      });
    }
  });
  const totalPossible = Math.max(allSkillNames.size, 1);
  const skillDiversityScore = (memberSkills.size / Math.max(totalPossible, 5)) * 100;

  // Availability overlap: intersection of available days
  const daysSets = members
    .filter((m) => m.availableDays && m.availableDays.length > 0)
    .map((m) => new Set(m.availableDays));

  let overlapDays = 0;
  if (daysSets.length > 0) {
    const intersection = [...daysSets[0]].filter((day) =>
      daysSets.every((s) => s.has(day))
    );
    overlapDays = intersection.length;
  }
  const availabilityScore = (overlapDays / 7) * 100;

  // Role coverage: distinct preferred roles / 5
  const roles = new Set(
    members
      .filter((m) => m.preferredRole && m.preferredRole !== 'No Preference')
      .map((m) => m.preferredRole)
  );
  const roleCoverageScore = (roles.size / 5) * 100;

  const suitabilityScore = Math.round(
    skillDiversityScore * w.skillDiversity +
    availabilityScore * w.availability +
    roleCoverageScore * w.roleCoverage
  );

  return {
    skillDiversityScore: Math.round(skillDiversityScore),
    availabilityScore: Math.round(availabilityScore),
    roleCoverageScore: Math.round(roleCoverageScore),
    suitabilityScore,
  };
}

/**
 * Assign roles within a team based on member preferences
 */
function assignRoles(members) {
  const defaultRoles = [
    'Project Manager',
    'Software Developer',
    'UI/UX Designer',
    'QA Tester',
    'Business Analyst',
  ];

  const assignments = [];
  const takenRoles = new Set();

  // First pass: assign preferred roles
  for (const member of members) {
    if (
      member.preferredRole &&
      member.preferredRole !== 'No Preference' &&
      !takenRoles.has(member.preferredRole)
    ) {
      assignments.push({ user: member._id, role: member.preferredRole });
      takenRoles.add(member.preferredRole);
    }
  }

  // Second pass: assign remaining roles
  for (const member of members) {
    const alreadyAssigned = assignments.find(
      (a) => a.user.toString() === member._id.toString()
    );
    if (!alreadyAssigned) {
      const availableRole = defaultRoles.find((r) => !takenRoles.has(r)) || 'Software Developer';
      assignments.push({ user: member._id, role: availableRole });
      takenRoles.add(availableRole);
    }
  }

  return assignments;
}

/**
 * Main team formation engine
 */
async function runTeamFormation({ minSize = 3, maxSize = 5, weights, coordinatorId }) {
  // 1. Collect unassigned students with complete profiles
  const students = await User.find({
    role: 'student',
    team: null,
    profileComplete: true,
    active: { $ne: false },
  });

  if (students.length === 0) {
    return { teamsCreated: 0, teams: [], message: 'No eligible students found' };
  }

  // 2. Shuffle students
  const shuffled = shuffle(students);

  // 3. Group students into max-size chunks, then keep any undersized tail unassigned.
  const groups = [];
  const leftoverStudents = [];

  for (let i = 0; i < shuffled.length; i += maxSize) {
    groups.push(shuffled.slice(i, i + maxSize));
  }

  const lastGroup = groups[groups.length - 1];
  if (lastGroup && lastGroup.length < minSize) {
    if (groups.length === 1) {
      leftoverStudents.push(...lastGroup);
      groups.pop();
    } else {
      const previousGroup = groups[groups.length - 2];
      if (previousGroup.length + lastGroup.length <= maxSize) {
        previousGroup.push(...lastGroup);
        groups.pop();
      } else {
        leftoverStudents.push(...lastGroup);
        groups.pop();
      }
    }
  }

  // 4. Score and create teams
  const createdTeams = [];

  for (const group of groups) {
    const scores = scoreGroup(group, weights);
    const roleAssignments = assignRoles(group);
    const teamName = await generateTeamName();

    const team = await Team.create({
      name: teamName,
      members: roleAssignments,
      suitabilityScore: scores.suitabilityScore,
      status: 'Forming',
    });

    // Update student team references
    const memberIds = group.map((m) => m._id);
    await User.updateMany(
      { _id: { $in: memberIds } },
      { $set: { team: team._id } }
    );

    const populatedTeam = await Team.findById(team._id).populate(
      'members.user',
      'fullName email studentId preferredRole skills'
    );

    let mlScore = null;
    let mlLabel = 'Unknown';
    try {
      const memberPayload = formatMembersForML(populatedTeam.members);
      const ml = await predictTeamQuality(memberPayload, 0.7);
      populatedTeam.mlScore = ml.score;
      populatedTeam.mlLabel = ml.label;
      await populatedTeam.save();
      mlScore = ml.score;
      mlLabel = ml.label;
    } catch (err) {
      console.warn('[ML Integration] Failed to enrich team with ML score:', err.message);
    }

    createdTeams.push({
      ...populatedTeam.toObject(),
      scores,
      mlScore,
      mlLabel,
    });
  }

  return {
    teamsCreated: createdTeams.length,
    teams: createdTeams,
    unassignedStudents: leftoverStudents.map((student) => ({
      _id: student._id,
      fullName: student.fullName,
      email: student.email,
    })),
    message: leftoverStudents.length > 0
      ? `${createdTeams.length} team(s) created. ${leftoverStudents.length} student(s) were left unassigned because there were not enough students to form another valid team.`
      : `${createdTeams.length} team(s) created successfully.`,
  };
}

module.exports = { runTeamFormation, scoreGroup };
