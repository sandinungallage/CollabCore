import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardCheck,
  Star,
  TrendingUp,
  MessageSquare,
  Award,
  User,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import * as evaluationsApi from '../../api/evaluations';
import { PageWrapper } from '../../components/layout';
import {
  Badge,
  Card,
  EmptyState,
  ProgressBar,
  SkeletonCard,
  StatCard,
  Button,
} from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { scoreToGrade, formatDate } from '../../utils/helpers';
import { cn } from '../../utils/helpers';

export default function FeedbackPage() {
  const { user } = useAuth();
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async () => {
    if (!user?._id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await evaluationsApi.getStudentHistory(user._id);
      const data = res.data?.data ?? res.data?.evaluations ?? res.data ?? [];
      setEvaluations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch evaluations:', err);
      setError(err?.response?.data?.message || 'Failed to load feedback records.');
    } finally {
      setLoading(false);
    }
  }, [user?._id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const scoreColor = (score) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'info';
    if (score >= 40) return 'warning';
    return 'danger';
  };

  const getEvaluationScore = (evaluation, modernKey, legacyKeys = []) => {
    const modernValue = evaluation?.[modernKey] ?? evaluation?.scores?.[modernKey];
    if (modernValue !== undefined && modernValue !== null) return modernValue;

    for (const key of legacyKeys) {
      const legacyValue = evaluation?.[key] ?? evaluation?.scores?.[key];
      if (legacyValue !== undefined && legacyValue !== null) return legacyValue;
    }

    return 0;
  };

  // Calculations for Summary
  const summaryStats = useMemo(() => {
    if (evaluations.length === 0) return null;

    const count = evaluations.length;
    const totals = evaluations.reduce(
      (acc, curr) => {
        acc.technical += getEvaluationScore(curr, 'technical', ['technicalQuality']);
        acc.collaboration += curr.scores?.collaboration ?? curr.collaboration ?? 0;
        acc.communication += getEvaluationScore(curr, 'communication', ['taskCompletion']);
        acc.leadership += getEvaluationScore(curr, 'leadership', ['innovation']);
        acc.overall += curr.overallScore ?? curr.overall ?? 0;
        return acc;
      },
      { technical: 0, collaboration: 0, communication: 0, leadership: 0, overall: 0 }
    );

    return {
      technical: Math.round(totals.technical / count),
      collaboration: Math.round(totals.collaboration / count),
      communication: Math.round(totals.communication / count),
      leadership: Math.round(totals.leadership / count),
      overall: Math.round(totals.overall / count),
    };
  }, [evaluations]);

  return (
    <PageWrapper>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary dark:text-text-inverted">
              Feedback & Evaluations
            </h1>
            <p className="mt-0.5 text-sm text-text-secondary dark:text-text-muted">
              Review grading dimensions, performance history, and feedback from your mentors.
            </p>
          </div>
          {evaluations.length > 0 && (
            <Button variant="ghost" size="sm" onClick={fetchHistory} disabled={loading}>
              <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
              Refresh
            </Button>
          )}
        </div>

        {/* Loading / Error States */}
        {loading ? (
          <div className="space-y-6">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={4} />
          </div>
        ) : error ? (
          <Card className="p-6">
            <EmptyState
              icon={AlertTriangle}
              title="Error Loading Evaluations"
              description={error}
              action={
                <Button variant="primary" size="sm" onClick={fetchHistory}>
                  Retry
                </Button>
              }
            />
          </Card>
        ) : evaluations.length === 0 ? (
          <Card className="p-8">
            <EmptyState
              icon={ClipboardCheck}
              title="No Evaluations Yet"
              description="Evaluations will appear here once your mentor submits them at milestone checkpoint reviews."
            />
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Overall Summary Stats */}
            {summaryStats && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <StatCard
                    label="Cumulative Average"
                    value={`${summaryStats.overall}%`}
                    icon={TrendingUp}
                    color={scoreColor(summaryStats.overall)}
                  />
                  <StatCard
                    label="Cohort Grade"
                    value={scoreToGrade(summaryStats.overall)}
                    icon={Award}
                    color="primary"
                  />
                  <StatCard
                    label="Evaluations Count"
                    value={evaluations.length}
                    icon={ClipboardCheck}
                    color="info"
                  />
                </div>

                {/* Score breakdown averages */}
                <Card title="Average Performance Dimensions" className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-text-secondary dark:text-text-muted">Technical Skill</span>
                        <span className="font-bold text-text-primary dark:text-text-inverted">{summaryStats.technical}%</span>
                      </div>
                      <ProgressBar value={summaryStats.technical} />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-text-secondary dark:text-text-muted">Collaboration</span>
                        <span className="font-bold text-text-primary dark:text-text-inverted">{summaryStats.collaboration}%</span>
                      </div>
                      <ProgressBar value={summaryStats.collaboration} />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-text-secondary dark:text-text-muted">Communication</span>
                        <span className="font-bold text-text-primary dark:text-text-inverted">{summaryStats.communication}%</span>
                      </div>
                      <ProgressBar value={summaryStats.communication} />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-text-secondary dark:text-text-muted">Leadership</span>
                        <span className="font-bold text-text-primary dark:text-text-inverted">{summaryStats.leadership}%</span>
                      </div>
                      <ProgressBar value={summaryStats.leadership} />
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Individual Evaluation Cards */}
            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                Evaluation History
              </h2>

              {evaluations.map((ev, index) => {
                const overall = ev.overallScore ?? ev.overall ?? 0;
                const tech = getEvaluationScore(ev, 'technical', ['technicalQuality']);
                const collab = ev.scores?.collaboration ?? ev.collaboration ?? 0;
                const comm = getEvaluationScore(ev, 'communication', ['taskCompletion']);
                const lead = getEvaluationScore(ev, 'leadership', ['innovation']);
                const mentor = ev.mentor?.fullName ?? ev.mentorId?.fullName ?? 'Mentor';
                const feedbackText = ev.writtenFeedback || ev.feedback || '';

                return (
                  <Card key={ev._id ?? index} className="p-5 flex flex-col md:flex-row gap-6 hover:shadow-sm transition-shadow">
                    {/* Left: Overall Grade Circle */}
                    <div className="flex md:flex-col items-center justify-between md:justify-center gap-4 border-b md:border-b-0 md:border-r border-surface-border dark:border-dark-border pb-4 md:pb-0 md:pr-6 md:w-44 shrink-0">
                      <div className="text-center md:mx-auto">
                        <div className="h-16 w-16 rounded-full bg-primary-light dark:bg-dark-primaryLight border border-primary/20 dark:border-dark-primaryAccent/20 flex items-center justify-center font-black text-2xl text-primary dark:text-dark-primaryAccent shadow-inner">
                          {scoreToGrade(overall)}
                        </div>
                        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mt-2">
                          Overall Score: {overall}%
                        </p>
                      </div>

                      <div className="text-right md:text-center">
                        <div className="flex items-center md:justify-center gap-1.5 text-xs text-text-primary dark:text-text-inverted font-semibold">
                          <User size={13} className="text-text-muted" />
                          <span>{mentor}</span>
                        </div>
                        <p className="text-[10px] text-text-muted mt-0.5">
                          {ev.createdAt ? formatDate(ev.createdAt, 'short') : 'Date unknown'}
                        </p>
                      </div>
                    </div>

                    {/* Right: Scores Breakdown + Text Feedback */}
                    <div className="flex-1 space-y-4">
                      {/* 4 Score Progress Bars */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <div className="flex justify-between text-[11px] mb-0.5">
                            <span className="font-semibold text-text-secondary dark:text-text-muted">Technical Skill</span>
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

                      {/* Text Feedback */}
                      {feedbackText && (
                        <div className="bg-surface-bg dark:bg-dark-elevated/20 p-3 rounded-lg border border-surface-border dark:border-dark-border">
                          <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
                            <MessageSquare size={10} />
                            Mentor Feedback
                          </h4>
                          <p className="text-xs text-text-secondary dark:text-text-muted leading-relaxed whitespace-pre-wrap">
                            {feedbackText}
                          </p>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
