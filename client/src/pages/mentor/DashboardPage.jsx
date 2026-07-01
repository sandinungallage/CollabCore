import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  AlertTriangle,
  TrendingUp,
  Eye,
  ChevronRight,
  Calendar,
  RefreshCw,
  FolderKanban,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

import { PageWrapper } from '../../components/layout';
import {
  StatCard,
  Badge,
  Avatar,
  Button,
  Spinner,
  EmptyState,
  SkeletonCard,
  ProgressBar,
  Card,
} from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { cn, formatDate, getAvatarColor } from '../../utils/helpers';
import * as teamsApi from '../../api/teams';
import * as evaluationsApi from '../../api/evaluations';
import api from '../../api/axios';

const RISK_TYPE_LABELS = {
  missing_skills: 'Missing Skills',
  workload_imbalance: 'Workload Imbalance',
  low_participation: 'Low Participation',
  delayed_milestone: 'Delayed Milestone',
};

function getRiskLabel(conflict) {
  return RISK_TYPE_LABELS[conflict?.conflictType] ?? conflict?.conflictType ?? 'System Alert';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getRiskLevel(team) {
  if (team.riskLevel) return team.riskLevel;
  if (team.risk) return team.risk;
  const progress = team.progress ?? team.overallProgress ?? team.completionRate ?? 0;
  if (progress < 20) return 'high';
  if (progress < 45) return 'medium';
  return 'low';
}

function getTeamProgress(team) {
  return (
    team.progress ??
    team.overallProgress ??
    team.completionRate ??
    team.progressPercentage ??
    0
  );
}

function getMemberCount(team) {
  if (typeof team.memberCount === 'number') return team.memberCount;
  if (Array.isArray(team.members)) return team.members.length;
  if (Array.isArray(team.studentIds)) return team.studentIds.length;
  return 0;
}

function getProjectName(team) {
  return (
    team.projectName ??
    team.project?.title ??
    team.project?.name ??
    team.projectTitle ??
    'No project assigned'
  );
}

// ─── Risk badge ─────────────────────────────────────────────────────────────

function RiskBadge({ level }) {
  const map = {
    high: { variant: 'danger', label: 'High Risk' },
    medium: { variant: 'warning', label: 'Medium Risk' },
    low: { variant: 'success', label: 'On Track' },
  };
  const { variant, label } = map[level?.toLowerCase()] ?? map.low;
  return <Badge variant={variant}>{label}</Badge>;
}

// ─── Team card ───────────────────────────────────────────────────────────────

function TeamCard({ team }) {
  const progress = getTeamProgress(team);
  const memberCount = getMemberCount(team);
  const projectName = getProjectName(team);
  const risk = getRiskLevel(team);
  const isHighRisk = risk === 'high';
  const isMedRisk = risk === 'medium';

  return (
    <div
      className={cn(
        'rounded-xl border shadow-sm p-5 flex flex-col gap-4 transition-all duration-200 hover:shadow-md group',
        'bg-surface-card border-surface-border',
        'dark:bg-dark-card dark:border-dark-border',
        isHighRisk && 'border-l-4 border-l-danger',
        isMedRisk && 'border-l-4 border-l-warning'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: getAvatarColor(team.name) }}
          >
            {team.name?.slice(0, 2).toUpperCase() ?? 'T?'}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-text-primary dark:text-text-inverted truncate">
              {team.name ?? `Team #${team._id?.slice(-4) ?? '--'}`}
            </h3>
            <p className="text-xs text-text-muted dark:text-text-muted flex items-center gap-1 mt-0.5 truncate">
              <FolderKanban size={11} />
              {projectName}
            </p>
          </div>
        </div>
        <RiskBadge level={risk} />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-text-secondary dark:text-text-muted">
        <span className="flex items-center gap-1">
          <Users size={13} className="shrink-0" />
          {memberCount} member{memberCount !== 1 ? 's' : ''}
        </span>
        {team.createdAt && (
          <span className="flex items-center gap-1">
            <Calendar size={13} className="shrink-0" />
            {formatDate(team.createdAt, 'short')}
          </span>
        )}
      </div>

      {/* Progress */}
      <div>
        <ProgressBar value={progress} label="Overall Progress" showValue />
      </div>

      {/* Risk indicators */}
      {Array.isArray(team.riskFlags) && team.riskFlags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {team.riskFlags.map((flag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800/40"
            >
              <AlertTriangle size={10} />
              {flag}
            </span>
          ))}
        </div>
      )}

      {/* Footer action */}
      <div className="flex items-center justify-end pt-1 border-t border-surface-border dark:border-dark-border">
        <Link
          to={`/mentor/teams/${team._id}`}
          className={cn(
            'inline-flex items-center gap-1.5 text-sm font-medium transition-colors',
            'text-primary dark:text-dark-primaryAccent',
            'hover:text-primary-dark dark:hover:text-blue-300'
          )}
        >
          <Eye size={14} />
          View Details
          <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}

// ─── Evaluation row ──────────────────────────────────────────────────────────

function EvaluationRow({ evaluation }) {
  const statusMap = {
    pending: { variant: 'warning', label: 'Pending', icon: Clock },
    submitted: { variant: 'success', label: 'Submitted', icon: CheckCircle2 },
    overdue: { variant: 'danger', label: 'Overdue', icon: XCircle },
  };
  const status = evaluation.status ?? 'pending';
  const { variant, label, icon: StatusIcon } = statusMap[status] ?? statusMap.pending;

  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-surface-bg dark:hover:bg-dark-elevated transition-colors group">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 shrink-0">
          <ClipboardCheck size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary dark:text-text-inverted truncate">
            {evaluation.title ?? evaluation.type ?? 'Evaluation'}
          </p>
          <p className="text-xs text-text-muted dark:text-text-muted truncate">
            {evaluation.teamName ??
              evaluation.team?.name ??
              `Team #${evaluation.teamId?.slice(-4) ?? '--'}`}
            {evaluation.dueDate && (
              <> · Due {formatDate(evaluation.dueDate, 'short')}</>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Badge variant={variant}>
          <StatusIcon size={11} className="mr-1" />
          {label}
        </Badge>
        <Link
          to={`/mentor/evaluations/${evaluation._id}`}
          className="text-primary dark:text-dark-primaryAccent text-sm font-medium hover:underline hidden sm:inline-flex items-center gap-1"
        >
          Submit
          <ChevronRight size={13} />
        </Link>
      </div>
    </div>
  );
}

// ─── Risk alert row ──────────────────────────────────────────────────────────

function RiskAlertRow({ team, conflict }) {
  const risk = conflict ? (conflict.severity || 'medium').toLowerCase() : getRiskLevel(team);
  const progress = team ? getTeamProgress(team) : null;
  const label = conflict ? getRiskLabel(conflict) : getProjectName(team);

  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-surface-bg dark:hover:bg-dark-elevated transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            'p-2 rounded-lg shrink-0',
            risk === 'high'
              ? 'bg-red-50 dark:bg-red-900/20 text-danger'
              : 'bg-yellow-50 dark:bg-yellow-900/20 text-warning'
          )}
        >
          <AlertTriangle size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary dark:text-text-inverted truncate">
            {team.name ?? `Team #${team._id?.slice(-4)}`}
          </p>
          <p className="text-xs text-text-muted dark:text-text-muted truncate">
            {conflict ? label : `${getProjectName(team)} · ${progress}% complete`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Badge variant={risk === 'high' || risk === 'critical' ? 'danger' : risk === 'medium' ? 'warning' : 'info'}>
          {conflict ? (conflict.severity || 'Medium') : risk === 'high' ? 'High Risk' : risk === 'medium' ? 'Medium Risk' : 'On Track'}
        </Badge>
        <Link
          to={`/mentor/teams/${team._id}`}
          className="text-primary dark:text-dark-primaryAccent text-sm font-medium hover:underline hidden sm:inline-flex items-center gap-1"
        >
          Review
          <ChevronRight size={13} />
        </Link>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MentorDashboardPage() {
  const { user } = useAuth();

  const [teams, setTeams] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingEvals, setLoadingEvals] = useState(true);
  const [loadingConflicts, setLoadingConflicts] = useState(true);
  const [errorTeams, setErrorTeams] = useState(null);
  const [errorEvals, setErrorEvals] = useState(null);
  const [errorConflicts, setErrorConflicts] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const fetchTeams = useCallback(async () => {
    if (!user?._id) return;
    setLoadingTeams(true);
    setErrorTeams(null);
    try {
      const res = await api.get(`/mentors/${user._id}/teams`);
      const data = res.data?.data ?? res.data?.teams ?? res.data ?? [];
      setTeams(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorTeams(err.message || 'Failed to load teams.');
    } finally {
      setLoadingTeams(false);
    }
  }, [user?._id]);

  // ── Fetch evaluations ────────────────────────────────────────────────────────
  const fetchEvaluations = useCallback(async () => {
    setLoadingEvals(true);
    setErrorEvals(null);
    try {
      const res = await evaluationsApi.getPending();
      const data = res.data?.data ?? res.data?.evaluations ?? res.data ?? [];
      setEvaluations(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorEvals(err.message || 'Failed to load evaluations.');
      setEvaluations([]);
    } finally {
      setLoadingEvals(false);
    }
  }, []);

  const fetchConflicts = useCallback(async () => {
    setLoadingConflicts(true);
    setErrorConflicts(null);
    try {
      const res = await api.get('/conflicts', { params: { status: 'Open', limit: 20 } });
      const data = res.data?.data ?? res.data?.conflicts ?? res.data ?? [];
      setConflicts(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorConflicts(err.message || 'Failed to load risk alerts.');
      setConflicts([]);
    } finally {
      setLoadingConflicts(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
    fetchEvaluations();
    fetchConflicts();
  }, [fetchTeams, fetchEvaluations, fetchConflicts]);

  const handleRefresh = () => {
    setLastRefreshed(new Date());
    fetchTeams();
    fetchEvaluations();
    fetchConflicts();
  };

  // ── Derived stats ────────────────────────────────────────────────────────────
  const totalStudents = teams.reduce((acc, t) => acc + getMemberCount(t), 0);
  const pendingCount = evaluations.filter(
    (e) => !e.status || e.status === 'pending' || e.status === 'overdue'
  ).length;
  const riskTeams = teams.filter((t) => {
    const r = getRiskLevel(t);
    return r === 'high' || r === 'medium';
  });

  const alertItems = conflicts.length > 0 ? conflicts : riskTeams;
  const alertCount = conflicts.length > 0 ? conflicts.length : riskTeams.length;

  // ─── Sorted risk teams (high first) ─────────────────────────────────────────
  const sortedRiskTeams = [...riskTeams].sort((a, b) => {
    const order = { high: 0, medium: 1 };
    return (order[getRiskLevel(a)] ?? 2) - (order[getRiskLevel(b)] ?? 2);
  });

  return (
    <PageWrapper>
      <div className="space-y-6 max-w-7xl mx-auto">

        {/* ── Welcome header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0"
              style={{ backgroundColor: getAvatarColor(user?.fullName ?? 'Mentor') }}
            >
              {(user?.fullName ?? 'M')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <p className="text-sm text-text-muted dark:text-text-muted">
                {getGreeting()},{' '}
                <span className="font-semibold text-primary dark:text-dark-primaryAccent">
                  {user?.fullName ?? 'Mentor'}
                </span>{' '}
                👋
              </p>
              <h1 className="text-2xl font-bold text-text-primary dark:text-text-inverted">
                Mentor Dashboard
              </h1>
              <p className="text-xs text-text-muted dark:text-text-muted mt-0.5">
                Last refreshed at {lastRefreshed.toLocaleTimeString()}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="self-start sm:self-center"
          >
            <RefreshCw size={14} />
            Refresh
          </Button>
        </div>

        {/* ── Stat cards ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Teams Assigned"
            value={loadingTeams ? '--' : teams.length}
            icon={LayoutDashboard}
            color="primary"
          />
          <StatCard
            label="Students Mentored"
            value={loadingTeams ? '--' : totalStudents}
            icon={Users}
            color="info"
          />
          <StatCard
            label="Pending Evaluations"
            value={loadingEvals ? '--' : pendingCount}
            icon={ClipboardCheck}
            color="warning"
          />
          <StatCard
            label="Risk Flags"
            value={loadingTeams || loadingConflicts ? '--' : alertCount}
            icon={AlertTriangle}
            color={alertCount > 0 ? 'danger' : 'success'}
          />
        </div>

        {/* ── Assigned Teams grid ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary-light dark:bg-dark-primaryLight">
                <TrendingUp size={16} className="text-primary dark:text-dark-primaryAccent" />
              </div>
              <h2 className="text-base font-semibold text-text-primary dark:text-text-inverted">
                Assigned Teams
              </h2>
              {!loadingTeams && (
                <Badge variant="gray">{teams.length}</Badge>
              )}
            </div>
            <Link
              to="/mentor/teams"
              className="text-sm text-primary dark:text-dark-primaryAccent hover:underline flex items-center gap-1 font-medium"
            >
              View all <ChevronRight size={14} />
            </Link>
          </div>

          {loadingTeams ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} lines={4} />
              ))}
            </div>
          ) : errorTeams ? (
            <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-6 flex items-center gap-4">
              <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30 text-danger shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-danger">Failed to load teams</p>
                <p className="text-sm text-text-secondary dark:text-text-muted mt-0.5 truncate">
                  {errorTeams}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={fetchTeams} className="shrink-0">
                Retry
              </Button>
            </div>
          ) : teams.length === 0 ? (
            <Card>
              <EmptyState
                icon={Users}
                title="No teams assigned yet"
                description="You have not been assigned to any teams. Check back later or contact the coordinator."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {teams.map((team) => (
                <TeamCard key={team._id ?? team.id} team={team} />
              ))}
            </div>
          )}
        </section>

        {/* ── Bottom two panels ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* Pending Evaluations */}
          <Card
            title="Pending Evaluations"
            action={
              <Link
                to="/mentor/evaluations"
                className="text-xs text-primary dark:text-dark-primaryAccent hover:underline flex items-center gap-0.5 font-medium"
              >
                View all <ChevronRight size={12} />
              </Link>
            }
            padding={false}
          >
            {loadingEvals ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="md" />
              </div>
            ) : errorEvals ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 px-5">
                <div className="p-3 rounded-full bg-red-50 dark:bg-red-900/20 text-danger">
                  <AlertTriangle size={22} />
                </div>
                <p className="text-sm text-text-secondary dark:text-text-muted text-center">
                  {errorEvals}
                </p>
                <Button variant="ghost" size="sm" onClick={fetchEvaluations}>
                  Retry
                </Button>
              </div>
            ) : evaluations.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="All caught up!"
                description="No pending evaluations right now. Great work!"
              />
            ) : (
              <div className="divide-y divide-surface-border dark:divide-dark-border px-1 py-1">
                {evaluations.slice(0, 8).map((ev) => (
                  <EvaluationRow key={ev._id ?? ev.id} evaluation={ev} />
                ))}
                {evaluations.length > 8 && (
                  <div className="px-4 py-3 text-center">
                    <Link
                      to="/mentor/evaluations"
                      className="text-sm text-primary dark:text-dark-primaryAccent hover:underline font-medium"
                    >
                      +{evaluations.length - 8} more evaluations
                    </Link>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Risk Alerts */}
          <Card
            title="Risk Alerts"
            action={
              <Link
                to="/mentor/risks"
                className="text-xs text-primary dark:text-dark-primaryAccent hover:underline flex items-center gap-0.5 font-medium"
              >
                View all <ChevronRight size={12} />
              </Link>
            }
            padding={false}
          >
            {loadingTeams || loadingConflicts ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="md" />
              </div>
            ) : errorConflicts ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 px-5">
                <div className="p-3 rounded-full bg-red-50 dark:bg-red-900/20 text-danger">
                  <AlertTriangle size={22} />
                </div>
                <p className="text-sm text-text-secondary dark:text-text-muted text-center">
                  {errorConflicts}
                </p>
              </div>
            ) : alertItems.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No risk flags"
                description="All your teams are progressing well. Keep it up!"
              />
            ) : (
              <div className="divide-y divide-surface-border dark:divide-dark-border px-1 py-1">
                {alertItems.slice(0, 8).map((item) => (
                  <RiskAlertRow
                    key={item._id ?? item.id}
                    team={item.team ?? item}
                    conflict={item.team ? item : null}
                  />
                ))}
                {alertItems.length > 8 && (
                  <div className="px-4 py-3 text-center">
                    <Link
                      to="/mentor/risks"
                      className="text-sm text-primary dark:text-dark-primaryAccent hover:underline font-medium"
                    >
                      +{alertItems.length - 8} more flagged items
                    </Link>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* ── Team Progress Overview strip ─────────────────────────────────────── */}
        {!loadingTeams && teams.length > 0 && (
          <Card className="overflow-hidden" padding={false}>
            <div className="px-5 py-4 border-b border-surface-border dark:border-dark-border flex items-center gap-2">
              <TrendingUp size={15} className="text-primary dark:text-dark-primaryAccent" />
              <h3 className="text-sm font-semibold text-text-primary dark:text-text-inverted">
                Team Progress Overview
              </h3>
            </div>
            <div className="p-5 space-y-3">
              {teams.map((team) => {
                const progress = getTeamProgress(team);
                const risk = getRiskLevel(team);
                return (
                  <div key={team._id ?? team.id} className="flex items-center gap-3">
                    <div className="w-32 shrink-0">
                      <p className="text-xs font-medium text-text-primary dark:text-text-inverted truncate">
                        {team.name ?? `Team #${team._id?.slice(-4)}`}
                      </p>
                    </div>
                    <div className="flex-1">
                      <ProgressBar value={progress} />
                    </div>
                    <div className="w-12 text-right shrink-0">
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          risk === 'high'
                            ? 'text-danger'
                            : risk === 'medium'
                            ? 'text-warning'
                            : 'text-success'
                        )}
                      >
                        {progress}%
                      </span>
                    </div>
                    <Link
                      to={`/mentor/teams/${team._id}`}
                      className="text-text-muted hover:text-primary dark:hover:text-dark-primaryAccent transition-colors shrink-0"
                      title="View team"
                    >
                      <Eye size={14} />
                    </Link>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

      </div>
    </PageWrapper>
  );
}
