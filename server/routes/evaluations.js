const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect, restrictTo } = require('../middleware/auth');
const {
  getEvaluations,
  createEvaluation,
  getPending,
  getEvaluationById,
  updateEvaluation,
  getStudentHistory,
} = require('../controllers/evaluationController');

router.use(protect);

router.get('/', getEvaluations);

router.post(
  '/',
  restrictTo('mentor'),
  [
    body('student').notEmpty().withMessage('Student is required'),
    body('technicalQuality').optional().isFloat({ min: 0, max: 100 }),
    body('technical').optional().isFloat({ min: 0, max: 100 }),
    body('collaboration').optional().isFloat({ min: 0, max: 100 }),
    body('communication').optional().isFloat({ min: 0, max: 100 }),
    body('leadership').optional().isFloat({ min: 0, max: 100 }),
    body('taskCompletion').optional().isFloat({ min: 0, max: 100 }),
    body('innovation').optional().isFloat({ min: 0, max: 100 }),
  ],
  createEvaluation
);

router.get('/pending', restrictTo('mentor'), getPending);

router.get('/student/:studentId/history', getStudentHistory);

router.get('/:id', getEvaluationById);

router.patch('/:id', restrictTo('mentor'), updateEvaluation);

module.exports = router;
