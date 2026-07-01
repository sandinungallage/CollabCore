import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import {
  ClipboardCheck,
  Plus,
  Edit,
  Star,
  User,
  Award,
  MessageSquare,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import * as evaluationsApi from '../../api/evaluations';
import * as usersApi from '../../api/users';
import { PageWrapper } from '../../components/layout';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  ProgressBar,
  SkeletonCard,
  StatCard,
} from '../../components/common';
import { scoreToGrade, formatDate, cn } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

const evaluationSchema = yup.object().shape({
  student: yup.string().required('Student selection is required'),
  technical: yup.number().typeError('Must be a number').min(0).max(100).required(),
  collaboration: yup.number().typeError('Must be a number').min(0).max(100).required(),
  communication: yup.number().typeError('Must be a number').min(0).max(100).required(),
  leadership: yup.number().typeError('Must be a number').min(0).max(100).required(),
  feedback: yup.string().required('Written feedback is required').min(10, 'Feedback must be at least 10 characters'),
});

function getScore(evaluation, modernKey, legacyKeys = []) {
  const value = evaluation?.[modernKey] ?? evaluation?.scores?.[modernKey];
  if (value !== undefined && value !== null) return value;

  for (const key of legacyKeys) {
    const legacyValue = evaluation?.[key] ?? evaluation?.scores?.[key];
    if (legacyValue !== undefined && legacyValue !== null) return legacyValue;
  }

  return 0;
}

export default function EvaluationsPage() {
  const { user } = useAuth();
  const [evaluations, setEvaluations] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvaluation, setEditingEvaluation] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // react-hook-form
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(evaluationSchema),
    defaultValues: {
      student: '',
      technical: 80,
      collaboration: 80,
      communication: 80,
      leadership: 80,
      feedback: '',
    },
  });

  // Watch slider values to display next to range input
  const watchedTech = watch('technical');
  const watchedCollab = watch('collaboration');
  const watchedComm = watch('communication');
  const watchedLead = watch('leadership');

  const fetchEvaluations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await evaluationsApi.getEvaluations();
      const data = res.data?.data ?? res.data?.evaluations ?? res.data ?? [];
      setEvaluations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch evaluations:', err);
      setError(err?.response?.data?.message || 'Failed to load evaluations.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStudentsList = useCallback(async () => {
    if (!user?._id) return;
    try {
      const res = await api.get(`/mentors/${user._id}/teams`);
      const teams = res.data?.data ?? res.data?.teams ?? res.data ?? [];
      const studentList = [];
      const seenIds = new Set();
      teams.forEach((t) => {
        (t.members || []).forEach((m) => {
          const sUser = m.user ?? m.userId;
          if (sUser && sUser._id && !seenIds.has(sUser._id)) {
            seenIds.add(sUser._id);
            studentList.push({
              _id: sUser._id,
              name: sUser.fullName || sUser.name || 'Student',
              email: sUser.email || '',
            });
          }
        });
      });
      setStudents(studentList);
    } catch (err) {
      console.error('Failed to fetch student list:', err);
    }
  }, [user?._id]);

  useEffect(() => {
    fetchEvaluations();
    fetchStudentsList();
  }, [fetchEvaluations, fetchStudentsList]);

  const handleOpenCreate = () => {
    setEditingEvaluation(null);
    reset({
      student: '',
      technical: 80,
      collaboration: 80,
      communication: 80,
      leadership: 80,
      feedback: '',
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (evaluation) => {
    setEditingEvaluation(evaluation);
    const studId = evaluation.student?._id ?? evaluation.student ?? '';
    reset({
      student: studId,
      technical: getScore(evaluation, 'technical', ['technicalQuality']) || 80,
      collaboration: getScore(evaluation, 'collaboration') || 80,
      communication: getScore(evaluation, 'communication', ['taskCompletion']) || 80,
      leadership: getScore(evaluation, 'leadership', ['innovation']) || 80,
      feedback: evaluation.writtenFeedback || evaluation.feedback || '',
    });
    setModalOpen(true);
  };

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      const overall = Math.round(
        (values.technical + values.collaboration + values.communication + values.leadership) / 4
      );

      const payload = {
        student: values.student,
        technicalQuality: values.technical,
        scores: {
          technical: values.technical,
          collaboration: values.collaboration,
          communication: values.communication,
          leadership: values.leadership,
        },
        // Support flat scores structure just in case
        technical: values.technical,
        collaboration: values.collaboration,
        communication: values.communication,
        leadership: values.leadership,
        taskCompletion: values.communication,
        innovation: values.leadership,
        overallScore: overall,
        overall: overall,
        writtenFeedback: values.feedback,
        feedback: values.feedback,
        status: editingEvaluation?.status || 'Submitted',
      };

      if (editingEvaluation) {
        await evaluationsApi.updateEvaluation(editingEvaluation._id, payload);
      } else {
        await evaluationsApi.createEvaluation(payload);
      }

      setModalOpen(false);
      reset();
      fetchEvaluations();
    } catch (err) {
      console.error('Failed to submit evaluation:', err);
      alert(err?.response?.data?.message || 'Failed to submit evaluation.');
    } finally {
      setSubmitting(false);
    }
  };

  // Calculations
  const totalSubmissions = evaluations.length;
  const avgCohortScore = evaluations.length
    ? Math.round(
        evaluations.reduce((acc, curr) => acc + (curr.overallScore ?? curr.overall ?? 0), 0) /
          evaluations.length
      )
    : 0;

  const scoreBadgeVariant = (score) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'info';
    if (score >= 40) return 'warning';
    return 'danger';
  };

  return (
    <PageWrapper>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary dark:text-text-inverted">
              Evaluations & Assessment
            </h1>
            <p className="mt-0.5 text-sm text-text-secondary dark:text-text-muted">
              Submit grade checkpoints and evaluate student milestones.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchEvaluations} disabled={loading}>
              <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
              Reload
            </Button>
            <Button variant="primary" size="sm" onClick={handleOpenCreate}>
              <Plus size={14} />
              New Evaluation
            </Button>
          </div>
        </div>

        {/* Stats */}
        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="My Evaluations Count" value={totalSubmissions} icon={ClipboardCheck} color="primary" />
            <StatCard label="Avg. Evaluation Score" value={`${avgCohortScore}%`} icon={Star} color={scoreBadgeVariant(avgCohortScore)} />
            <StatCard label="Cohort Grade Equivalent" value={scoreToGrade(avgCohortScore)} icon={Award} color="info" />
          </div>
        )}

        {/* Main Content */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} lines={4} />
            ))}
          </div>
        ) : error ? (
          <Card className="p-6">
            <EmptyState
              icon={AlertTriangle}
              title="Error Loading Evaluations"
              description={error}
              action={
                <Button variant="primary" size="sm" onClick={fetchEvaluations}>
                  Try Again
                </Button>
              }
            />
          </Card>
        ) : evaluations.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={ClipboardCheck}
              title="No Evaluations Yet"
              description="Start tracking student progress by submitting your first review checkpoint."
              action={
                <Button variant="primary" size="sm" onClick={handleOpenCreate}>
                  <Plus size={14} />
                  New Evaluation
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {evaluations.map((ev, index) => {
              const overall = ev.overallScore ?? ev.overall ?? 0;
              const tech = ev.scores?.technical ?? ev.technical ?? 0;
              const collab = ev.scores?.collaboration ?? ev.collaboration ?? 0;
              const comm = ev.scores?.communication ?? ev.communication ?? 0;
              const lead = ev.scores?.leadership ?? ev.leadership ?? 0;
              const studentName = ev.student?.name ?? ev.studentName ?? 'Student';
              const studentEmail = ev.student?.email ?? '';

              return (
                <Card
                  key={ev._id ?? index}
                  className="p-5 flex flex-col md:flex-row gap-6 hover:shadow-sm transition-shadow relative group"
                >
                  {/* Left: Identity & Grade */}
                  <div className="flex md:flex-col justify-between md:justify-center items-center md:items-start gap-4 border-b md:border-b-0 md:border-r border-surface-border dark:border-dark-border pb-4 md:pb-0 md:pr-6 md:w-48 shrink-0">
                    <div>
                      <h3 className="font-bold text-sm text-text-primary dark:text-text-inverted truncate max-w-[170px]">
                        {studentName}
                      </h3>
                      {studentEmail && (
                        <p className="text-[10px] text-text-muted truncate max-w-[170px] mt-0.5">
                          {studentEmail}
                        </p>
                      )}
                      <p className="text-[10px] text-text-muted mt-2">
                        {ev.createdAt ? formatDate(ev.createdAt, 'short') : 'Date unknown'}
                      </p>
                    </div>

                    <div className="flex items-center md:justify-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary-light dark:bg-dark-primaryLight border border-primary/20 flex items-center justify-center font-black text-sm text-primary dark:text-dark-primaryAccent">
                        {scoreToGrade(overall)}
                      </div>
                      <Badge variant={scoreBadgeVariant(overall)}>
                        {overall}%
                      </Badge>
                    </div>
                  </div>

                  {/* Right: Scores Progress & feedback */}
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span className="font-semibold text-text-secondary dark:text-text-muted">Technical skill</span>
                          <span className="font-bold text-text-primary dark:text-text-inverted">{tech}%</span>
                        </div>
                        <ProgressBar value={tech} />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span className="font-semibold text-text-secondary dark:text-text-muted">Collaboration</span>
                          <span className="font-bold text-text-primary dark:text-text-inverted">{collab}%</span>
                        </div>
                        <ProgressBar value={collab} />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span className="font-semibold text-text-secondary dark:text-text-muted">Communication</span>
                          <span className="font-bold text-text-primary dark:text-text-inverted">{comm}%</span>
                        </div>
                        <ProgressBar value={comm} />
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span className="font-semibold text-text-secondary dark:text-text-muted">Leadership</span>
                          <span className="font-bold text-text-primary dark:text-text-inverted">{lead}%</span>
                        </div>
                        <ProgressBar value={lead} />
                      </div>
                    </div>

                    {/* Feedback */}
                    {(ev.writtenFeedback || ev.feedback) && (
                      <div className="bg-surface-bg dark:bg-dark-elevated/20 p-3 rounded-lg border border-surface-border dark:border-dark-border flex items-start gap-2.5">
                        <MessageSquare size={13} className="text-text-muted mt-0.5 shrink-0" />
                        <p className="text-xs text-text-secondary dark:text-text-muted leading-relaxed whitespace-pre-wrap">
                          {ev.writtenFeedback || ev.feedback}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Absolute Edit Button */}
                  <button
                    onClick={() => handleOpenEdit(ev)}
                    className="absolute right-4 top-4 p-1 rounded-lg text-text-secondary hover:text-primary hover:bg-surface-bg dark:hover:bg-dark-elevated opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Edit size={14} />
                  </button>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingEvaluation ? 'Edit Evaluation' : 'New Evaluation Checkpoint'}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Select Student */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary dark:text-text-muted uppercase tracking-wider mb-1.5">
              Select Student
            </label>
            <div className="relative">
              <select
                {...register('student')}
                disabled={!!editingEvaluation}
                className={cn(
                  'w-full appearance-none px-3.5 py-2.5 text-xs rounded-lg border outline-none transition-colors cursor-pointer',
                  'bg-surface-card border-surface-border text-text-primary',
                  'dark:bg-dark-card dark:border-dark-border dark:text-text-inverted',
                  'focus:border-primary dark:focus:border-dark-primaryAccent',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <option value="">Select a student...</option>
                {students.map((stud) => (
                  <option key={stud._id} value={stud._id}>
                    {stud.name} ({stud.email})
                  </option>
                ))}
              </select>
              {!editingEvaluation && (
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              )}
            </div>
            {errors.student?.message && (
              <p className="mt-1 text-xs text-danger">{errors.student.message}</p>
            )}
          </div>

          {/* Technical Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label className="font-semibold text-text-secondary dark:text-text-muted">Technical Skill Score</label>
              <span className="font-bold text-primary dark:text-dark-primaryAccent">{watchedTech}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              {...register('technical', { valueAsNumber: true })}
              className="w-full h-1.5 bg-surface-border dark:bg-dark-elevated rounded-lg appearance-none cursor-pointer accent-primary dark:accent-dark-primaryAccent"
            />
          </div>

          {/* Collaboration Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label className="font-semibold text-text-secondary dark:text-text-muted">Collaboration Score</label>
              <span className="font-bold text-primary dark:text-dark-primaryAccent">{watchedCollab}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              {...register('collaboration', { valueAsNumber: true })}
              className="w-full h-1.5 bg-surface-border dark:bg-dark-elevated rounded-lg appearance-none cursor-pointer accent-primary dark:accent-dark-primaryAccent"
            />
          </div>

          {/* Communication Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label className="font-semibold text-text-secondary dark:text-text-muted">Communication Score</label>
              <span className="font-bold text-primary dark:text-dark-primaryAccent">{watchedComm}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              {...register('communication', { valueAsNumber: true })}
              className="w-full h-1.5 bg-surface-border dark:bg-dark-elevated rounded-lg appearance-none cursor-pointer accent-primary dark:accent-dark-primaryAccent"
            />
          </div>

          {/* Leadership Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label className="font-semibold text-text-secondary dark:text-text-muted">Leadership Score</label>
              <span className="font-bold text-primary dark:text-dark-primaryAccent">{watchedLead}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              {...register('leadership', { valueAsNumber: true })}
              className="w-full h-1.5 bg-surface-border dark:bg-dark-elevated rounded-lg appearance-none cursor-pointer accent-primary dark:accent-dark-primaryAccent"
            />
          </div>

          {/* Written Feedback */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary dark:text-text-muted uppercase tracking-wider mb-1.5">
              Written Feedback
            </label>
            <textarea
              {...register('feedback')}
              rows={4}
              placeholder="Provide constructive assessment comments..."
              className={cn(
                'w-full px-3 py-2.5 text-xs rounded-lg border outline-none transition-colors resize-y min-h-[90px]',
                'bg-surface-card border-surface-border text-text-primary placeholder:text-text-muted',
                'dark:bg-dark-card dark:border-dark-border dark:text-text-inverted',
                'focus:border-primary dark:focus:border-dark-primaryAccent'
              )}
            />
            {errors.feedback?.message && (
              <p className="mt-1 text-xs text-danger">{errors.feedback.message}</p>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border dark:border-dark-border">
            <Button variant="ghost" size="sm" type="button" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" loading={submitting}>
              {editingEvaluation ? 'Save Changes' : 'Submit Evaluation'}
            </Button>
          </div>
        </form>
      </Modal>
    </PageWrapper>
  );
}
