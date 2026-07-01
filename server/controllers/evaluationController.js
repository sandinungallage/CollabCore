const { Evaluation, Notification, User } = require('../models');

// GET /api/v1/evaluations
exports.getEvaluations = async (req, res, next) => {
  try {
    const { student, milestone, team, status, page = 1, limit = 20 } = req.query;
    const filter = {};

    // Role-based filtering
    if (req.user.role === 'mentor') {
      filter.mentor = req.user._id;
    } else if (req.user.role === 'student') {
      filter.student = req.user._id;
      filter.status = 'Submitted'; // Students only see submitted evaluations
    }

    if (student) filter.student = student;
    if (milestone) filter.milestone = milestone;
    if (team) filter.team = team;
    if (status && req.user.role !== 'student') filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Evaluation.countDocuments(filter);

    const evaluations = await Evaluation.find(filter)
      .populate('student', 'fullName email avatar studentId')
      .populate('mentor', 'fullName email')
      .populate('milestone', 'name')
      .populate('team', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: evaluations.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: evaluations,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/evaluations
exports.createEvaluation = async (req, res, next) => {
  try {
    const {
      student, milestone, team, technicalQuality, technical, collaboration,
      communication, leadership, taskCompletion, innovation, writtenFeedback, feedback, strengthTags,
      improvementTags, status, mark,
    } = req.body;

    const finalStatus = status || 'Submitted';
    const finalFeedback = writtenFeedback ?? feedback ?? '';

    const evaluation = await Evaluation.create({
      student,
      mentor: req.user._id,
      milestone,
      team,
      technicalQuality,
      technical,
      collaboration,
      communication,
      leadership,
      taskCompletion,
      innovation,
      writtenFeedback: finalFeedback,
      strengthTags,
      improvementTags,
      status: finalStatus,
      mark,
    });

    // If submitted, notify student and coordinators
    if (finalStatus === 'Submitted') {
      await Notification.create({
        recipient: student,
        type: 'feedback',
        title: 'New Feedback Received',
        body: `You have received feedback from ${req.user.fullName}.`,
        link: '/student/feedback',
      });

      const coordinators = await User.find({ role: 'coordinator', active: { $ne: false } });
      await Promise.all(
        coordinators.map(coord =>
          Notification.create({
            recipient: coord._id,
            type: 'feedback',
            title: 'Evaluation Submitted',
            body: `${req.user.fullName} submitted an evaluation for a student.`,
            link: '/coordinator/students',
          })
        )
      );
    }

    const populated = await Evaluation.findById(evaluation._id)
      .populate('student', 'fullName email')
      .populate('mentor', 'fullName email')
      .populate('milestone', 'name');

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/evaluations/pending
exports.getPending = async (req, res, next) => {
  try {
    const evaluations = await Evaluation.find({
      mentor: req.user._id,
      status: 'Draft',
    })
      .populate('student', 'fullName email avatar studentId')
      .populate('milestone', 'name')
      .populate('team', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: evaluations.length, data: evaluations });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/evaluations/:id
exports.getEvaluationById = async (req, res, next) => {
  try {
    const evaluation = await Evaluation.findById(req.params.id)
      .populate('student', 'fullName email avatar studentId skills')
      .populate('mentor', 'fullName email')
      .populate('milestone', 'name description dueDate')
      .populate('team', 'name');

    if (!evaluation) {
      return res.status(404).json({ success: false, message: 'Evaluation not found' });
    }

    // Access control
    if (
      req.user.role === 'student' &&
      evaluation.student._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (
      req.user.role === 'mentor' &&
      evaluation.mentor._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: evaluation });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/evaluations/:id
exports.updateEvaluation = async (req, res, next) => {
  try {
    const evaluation = await Evaluation.findById(req.params.id);

    if (!evaluation) {
      return res.status(404).json({ success: false, message: 'Evaluation not found' });
    }

    if (evaluation.mentor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the evaluating mentor can update' });
    }

    if (evaluation.status === 'Submitted') {
      return res.status(400).json({ success: false, message: 'Cannot edit a submitted evaluation' });
    }

    const allowedUpdates = [
      'technicalQuality', 'technical', 'collaboration', 'communication', 'leadership', 'taskCompletion', 'innovation',
      'writtenFeedback', 'feedback', 'strengthTags', 'improvementTags', 'status', 'mark',
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) evaluation[field] = req.body[field];
    });

    if (req.body.feedback !== undefined && req.body.writtenFeedback === undefined) {
      evaluation.writtenFeedback = req.body.feedback;
    }

    await evaluation.save();

    // If now submitted, notify
    if (req.body.status === 'Submitted') {
      await Notification.create({
        recipient: evaluation.student,
        type: 'feedback',
        title: 'New Feedback Received',
        body: `You have received feedback from ${req.user.fullName}.`,
        link: '/student/feedback',
      });
    }

    res.json({ success: true, data: evaluation });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/evaluations/student/:studentId/history
exports.getStudentHistory = async (req, res, next) => {
  try {
    // Access control
    if (
      req.user.role === 'student' &&
      req.params.studentId !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const evaluations = await Evaluation.find({
      student: req.params.studentId,
      status: 'Submitted',
    })
      .populate('mentor', 'fullName')
      .populate('milestone', 'name order')
      .populate('team', 'name')
      .sort({ createdAt: 1 });

    res.json({ success: true, count: evaluations.length, data: evaluations });
  } catch (err) {
    next(err);
  }
};
