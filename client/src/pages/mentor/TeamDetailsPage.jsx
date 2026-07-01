import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Users,
  Award,
  Mail,
  Calendar,
  FolderKanban,
  TrendingUp,
  Clock,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react';
import * as teamsApi from '../../api/teams';
import * as tasksApi from '../../api/tasks';
import * as milestonesApi from '../../api/milestones';
import { PageWrapper } from '../../components/layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  SkeletonCard,
  StatCard,
} from '../../components/common';
import { cn, formatDate, scoreToGrade } from '../../utils/helpers';

export default function TeamDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [team, setTeam] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTeamDetails = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [teamRes, tasksRes, milestonesRes] = await Promise.all([
        teamsApi.getTeamById(id),
        tasksApi.getTasks({ team: id }),
        milestonesApi.getTimeline(id),
      ]);

      setTeam(teamRes.data?.data ?? teamRes.data ?? null);
      
      const teamTasks = tasksRes.data?.data ?? tasksRes.data?.tasks ?? tasksRes.data ?? [];
      setTasks(Array.isArray(teamTasks) ? teamTasks : []);

      const teamMilestones = milestonesRes.data?.data ?? milestonesRes.data?.milestones ?? milestonesRes.data ?? [];
      setMilestones(Array.isArray(teamMilestones) ? teamMilestones : []);
    } catch (err) {
      console.error('Failed to load team details:', err);
      setError(err?.response?.data?.message || 'Failed to fetch team records.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTeamDetails();
  }, [fetchTeamDetails]);

  // Derived Calculations
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'Completed').length;
    const pendingMilestones = milestones.filter((m) => {
      const status = (m.status || '').toLowerCase();
      return status !== 'approved' && status !== 'submitted' && status !== 'completed';
    }).length;
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pendingMilestones, progressPercent };
  }, [tasks, milestones]);

  const priorityBadgeVariant = (priority) => {
    const p = (priority || 'medium').toLowerCase();
    if (p === 'critical') return 'danger';
    if (p === 'high') return 'warning';
    if (p === 'low') return 'gray';
    return 'primary';
  };

  return (
    <PageWrapper>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Back Link */}
        <div>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-primary dark:hover:text-dark-primaryAccent transition-colors"
          >
            <ArrowLeft size={13} />
            Back
          </button>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {team && (
            <div>
              <h1 className="text-2xl font-bold text-text-primary dark:text-text-inverted">
                {team.name}
              </h1>
              <p className="mt-0.5 text-sm text-text-secondary dark:text-text-muted flex items-center gap-1.5">
                <FolderKanban size={14} className="text-text-muted" />
                Project: <span className="font-semibold text-text-primary dark:text-text-inverted">{team.project?.title ?? team.project?.name ?? 'Unassigned'}</span>
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchTeamDetails} disabled={loading}>
              <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Content states */}
        {loading ? (
          <div className="space-y-6">
            <SkeletonCard lines={2} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SkeletonCard lines={5} />
              <SkeletonCard lines={5} />
            </div>
          </div>
        ) : error ? (
          <Card className="p-6">
            <EmptyState
              icon={AlertTriangle}
              title="Error Loading Details"
              description={error}
              action={
                <Button variant="primary" size="sm" onClick={fetchTeamDetails}>
                  Retry
                </Button>
              }
            />
          </Card>
        ) : !team ? (
          <Card className="p-6">
            <EmptyState
              icon={Users}
              title="Team Not Found"
              description="The requested team does not exist or has been deleted."
            />
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Tasks Completed" value={`${stats.completed} / ${stats.total}`} icon={TrendingUp} color="success" />
              <StatCard label="Pending Milestones" value={stats.pendingMilestones} icon={Calendar} color="warning" />
              <StatCard label="Team Suitability Match" value={`${team.suitabilityScore ?? team.score ?? 0}%`} icon={Award} color="primary" />
            </div>

            {/* Overall Progress strip */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-secondary dark:text-text-muted">Milestone Checkpoint Progress</span>
                <span className="text-xs font-bold text-text-primary dark:text-text-inverted">{stats.progressPercent}%</span>
              </div>
              <ProgressBar value={stats.progressPercent} />
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Members Space */}
              <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                  Team Members ({team.members?.length || 0})
                </h2>
                <Card className="p-4 space-y-4">
                  {(team.members || []).map((m) => {
                    const mUser = m.user ?? m.userId ?? m;
                    const name = mUser.fullName ?? mUser.name ?? 'Member';
                    const email = mUser.email ?? '';
                    const role = m.role ?? mUser.role ?? 'Developer';
                    return (
                      <div key={m._id} className="flex items-start justify-between gap-3 border-b border-surface-border/40 dark:border-dark-border/40 pb-3 last:border-0 last:pb-0">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <Avatar name={name} size="md" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-text-primary dark:text-text-inverted truncate">
                              {name}
                            </p>
                            <span className="text-[9px] text-primary dark:text-dark-primaryAccent font-medium block">
                              {role}
                            </span>
                            <a
                              href={`mailto:${email}`}
                              className="text-[9px] text-text-muted hover:text-primary dark:hover:text-dark-primaryAccent flex items-center gap-1 mt-1 truncate"
                            >
                              <Mail size={10} />
                              {email}
                            </a>
                          </div>
                        </div>
                        <Badge variant="gray" className="text-[8px] px-1 py-0 shrink-0 font-bold uppercase tracking-wider">
                          {scoreToGrade(m.suitabilityScore ?? 80)}
                        </Badge>
                      </div>
                    );
                  })}
                </Card>
              </div>

              {/* Tasks List */}
              <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                  Active Tasks ({tasks.filter((t) => t.status !== 'Completed').length})
                </h2>
                <Card className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                  {tasks.length === 0 ? (
                    <EmptyState
                      icon={ClipboardList}
                      title="No Tasks Found"
                      description="No tasks are currently defined for this team."
                      className="py-6"
                    />
                  ) : (
                    tasks.map((task) => (
                      <div
                        key={task._id}
                        className="p-3 border border-surface-border dark:border-dark-border bg-surface-bg dark:bg-dark-elevated/20 rounded-lg space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-bold text-text-primary dark:text-text-inverted line-clamp-2 leading-normal">
                            {task.title}
                          </h4>
                          <Badge variant={priorityBadgeVariant(task.priority)} className="text-[8px] font-medium shrink-0">
                            {task.priority || 'Medium'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-text-muted border-t border-surface-border/20 pt-2 mt-1">
                          <span className="font-medium">{task.status}</span>
                          {task.assignee?.fullName && <span>Assignee: {task.assignee.fullName.split(' ')[0]}</span>}
                        </div>
                      </div>
                    ))
                  )}
                </Card>
              </div>

              {/* Milestones timeline */}
              <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
                  Milestones
                </h2>
                <Card className="p-4 space-y-3.5">
                  {milestones.length === 0 ? (
                    <p className="text-xs text-text-muted italic text-center py-6">
                      No milestones set for this team yet.
                    </p>
                  ) : (
                    milestones.map((ms, idx) => {
                      const isApproved = ms.status === 'approved';
                      const isSubmitted = ms.status === 'submitted' || ms.status === 'Completed';
                      return (
                        <div key={ms._id ?? idx} className="flex gap-2.5 items-start">
                          <div
                            className={cn(
                              'h-2 w-2 rounded-full mt-1.5 shrink-0',
                              isApproved
                                ? 'bg-success'
                                : isSubmitted
                                ? 'bg-blue-500'
                                : 'bg-neutral'
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-text-primary dark:text-text-inverted truncate">
                              {ms.name}
                            </p>
                            <p className="text-[9px] text-text-muted mt-0.5">
                              Due: {formatDate(ms.dueDate, 'short')}
                            </p>
                            {ms.deliverable && (
                              <a
                                href={ms.deliverable.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[9px] text-primary dark:text-dark-primaryAccent hover:underline block truncate mt-1"
                              >
                                View File: {ms.deliverable.filename}
                              </a>
                            )}
                          </div>
                          <Badge
                            variant={isApproved ? 'success' : isSubmitted ? 'info' : 'gray'}
                            className="text-[8px] font-semibold uppercase shrink-0"
                          >
                            {ms.status || 'Pending'}
                          </Badge>
                        </div>
                      );
                    })
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
