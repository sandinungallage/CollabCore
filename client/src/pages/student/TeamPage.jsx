import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Users, Award, Mail, Calendar, FolderKanban, TrendingUp,
  AlertTriangle, RefreshCw, Clock, Search, Send, X,
  CheckCircle, XCircle, Hourglass, UserPlus, ChevronRight,
  Loader2,
} from 'lucide-react';
import * as teamsApi from '../../api/teams';
import * as tasksApi from '../../api/tasks';
import * as milestonesApi from '../../api/milestones';
import * as usersApi from '../../api/users';
import { PageWrapper } from '../../components/layout';
import {
  Avatar, Badge, Button, Card, EmptyState,
  ProgressBar, SkeletonCard, StatCard,
} from '../../components/common';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils/helpers';

const ROLES = [
  'Software Developer', 'UI/UX Designer', 'QA Tester',
  'Business Analyst', 'Contributor',
];

const statusConfig = {
  pending:  { label: 'Pending',  icon: Hourglass,   cls: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40' },
  accepted: { label: 'Accepted', icon: CheckCircle,  cls: 'text-green-600 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40' },
  declined: { label: 'Declined', icon: XCircle,      cls: 'text-red-500 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40' },
  cancelled:{ label: 'Cancelled',icon: X,            cls: 'text-gray-400 dark:text-gray-500',    bg: 'bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700/40' },
};

// ── Invite Panel (sub-component) ──────────────────────────────────────────────
function InvitePanel({ user, onClose, onProposed }) {
  const [step, setStep] = useState('invite'); // 'invite' | 'submit'
  const [teamName, setTeamName]         = useState('');
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]       = useState(false);
  const [invites, setInvites]           = useState([]);        // from API
  const [sendingTo, setSendingTo]       = useState(null);      // userId being invited
  const [roleMap, setRoleMap]           = useState({});        // userId → role
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState(null);
  const [success, setSuccess]           = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);
  const pollRef = useRef(null);

  // Load existing sent invites on mount and keep polling every 8s
  const loadInvites = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await teamsApi.getSentInvites();
      setInvites(res.data?.data ?? []);
    } catch { /* silent */ }
    finally { if (showSpinner) setRefreshing(false); }
  }, []);

  useEffect(() => {
    loadInvites();
    // Poll every 8 seconds so accepted/declined statuses update automatically
    pollRef.current = setInterval(() => loadInvites(), 8000);
    return () => clearInterval(pollRef.current);
  }, [loadInvites]);

  // Debounced search
  const handleSearch = (q) => {
    setSearchQuery(q);
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await usersApi.getUsers({
          // Do NOT filter by teamStatus here.
          // Students with stale team refs (pointing to deleted teams) have a
          // non-null ObjectId in MongoDB but populate() returns null.
          // Filtering by teamStatus=unassigned would exclude them incorrectly.
          // We instead check the populated `team` object on the frontend.
          role: 'student',
          search: q.trim(),
          limit: 30,
        });
        const responseData = res.data;
        const list = Array.isArray(responseData?.data)
          ? responseData.data
          : Array.isArray(responseData) ? responseData : [];
        // Exclude self and already-invited students
        const invitedIds = new Set(invites.map((i) => i.to?._id ?? i.to));
        setSearchResults(list.filter((s) => s._id !== user._id && !invitedIds.has(s._id)));
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 350);
  };

  // A student is truly available only if their populated team object has no name.
  // Stale refs (pointing to deleted teams) will populate as null → available.
  const isAvailable = (student) => !student.team?.name && !student.team?._id;

  const handleSendInvite = async (student) => {
    const role = roleMap[student._id] || 'Software Developer';
    setSendingTo(student._id);
    setError(null);
    try {
      await teamsApi.sendInvite({ toUserId: student._id, role, proposedTeamName: teamName.trim() });
      await loadInvites();
      setSearchResults((prev) => prev.filter((s) => s._id !== student._id));
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to send invite.');
    } finally {
      setSendingTo(null);
    }
  };

  const handleCancelInvite = async (inviteId) => {
    try {
      await teamsApi.cancelInvite(inviteId);
      setInvites((prev) => prev.filter((i) => i._id !== inviteId));
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to cancel invite.');
    }
  };

  const handleSubmitProposal = async () => {
    if (!teamName.trim()) { setError('Team name is required.'); return; }
    const acceptedInvites = invites.filter((i) => i.status === 'accepted');
    if (acceptedInvites.length < 2) {
      setError('You need at least 2 accepted invites before submitting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await teamsApi.proposeTeam({
        name: teamName.trim(),
        inviteIds: acceptedInvites.map((i) => i._id),
      });
      setSuccess(true);
      setTimeout(() => { onProposed(); onClose(); }, 1500);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to submit proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  const acceptedCount = invites.filter((i) => i.status === 'accepted').length;
  const canSubmit = teamName.trim() && acceptedCount >= 2;

  if (success) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-text-primary dark:text-text-inverted">Proposal Submitted!</h3>
        <p className="text-sm text-text-secondary dark:text-text-muted mt-1">Waiting for coordinator approval.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-primary dark:text-text-inverted">Propose a Project Team</h2>
          <p className="text-xs text-text-secondary dark:text-text-muted mt-0.5">
            Search for teammates, send invitations, and submit once they accept.
          </p>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
          <X size={18} />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-danger text-xs">
          {error}
        </div>
      )}

      {/* Team Name */}
      <div>
        <label className="block text-xs font-semibold text-text-secondary dark:text-text-muted mb-1.5">
          Team Name <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="e.g. Team Rising Bytes"
          className="w-full px-3 py-2 text-sm rounded-lg bg-surface-input dark:bg-dark-input border border-surface-border dark:border-dark-border text-text-primary dark:text-text-inverted focus:ring-1 focus:ring-primary outline-none"
        />
      </div>

      {/* Search + Invite */}
      <div>
        <label className="block text-xs font-semibold text-text-secondary dark:text-text-muted mb-1.5">
          Find &amp; Invite Teammates
        </label>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name, email, or student ID..."
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg bg-surface-input dark:bg-dark-input border border-surface-border dark:border-dark-border text-text-primary dark:text-text-inverted focus:ring-1 focus:ring-primary outline-none"
          />
          {searching && (
            <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted animate-spin" />
          )}
        </div>

        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="mt-2 rounded-xl border border-surface-border dark:border-dark-border bg-surface-card dark:bg-dark-card divide-y divide-surface-border dark:divide-dark-border overflow-hidden shadow-sm">
            {searchResults.map((student) => {
              const available = isAvailable(student);
              return (
                <div key={student._id} className={cn('flex items-center gap-3 px-3 py-2.5', !available && 'opacity-70')}>
                  <Avatar name={student.fullName} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary dark:text-text-inverted truncate">{student.fullName}</p>
                    <p className="text-[11px] text-text-muted truncate">
                      {student.studentId || student.email}
                      {!available && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          · Already in a team
                        </span>
                      )}
                    </p>
                  </div>
                  {available ? (
                    <>
                      <select
                        value={roleMap[student._id] || 'Software Developer'}
                        onChange={(e) => setRoleMap((prev) => ({ ...prev, [student._id]: e.target.value }))}
                        className="text-[11px] px-2 py-1 rounded-md border border-surface-border dark:border-dark-border bg-surface-input dark:bg-dark-input text-text-primary dark:text-text-inverted outline-none"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button
                        onClick={() => handleSendInvite(student)}
                        disabled={sendingTo === student._id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-primary hover:bg-primary/90 text-white disabled:opacity-60 transition-colors shrink-0"
                      >
                        {sendingTo === student._id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Send size={11} />}
                        Invite
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold shrink-0">
                      In Team
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {searchQuery && !searching && searchResults.length === 0 && (
          <p className="text-xs text-text-muted mt-2 text-center py-3">No students found for "{searchQuery}".</p>
        )}
      </div>

      {/* Sent Invites */}
      {invites.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-text-secondary dark:text-text-muted uppercase tracking-wider">
              Sent Invitations ({invites.length})
            </p>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-text-muted">
                {acceptedCount} accepted · {invites.filter(i => i.status === 'pending').length} pending
              </span>
              <button
                onClick={() => loadInvites(true)}
                disabled={refreshing}
                title="Refresh statuses"
                className="text-text-muted hover:text-primary transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={cn(refreshing && 'animate-spin')} />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {invites.map((inv) => {
              const cfg = statusConfig[inv.status] || statusConfig.pending;
              const StatusIcon = cfg.icon;
              const student = inv.to;
              return (
                <div
                  key={inv._id}
                  className={cn('flex items-center gap-3 p-2.5 rounded-xl border', cfg.bg)}
                >
                  <Avatar name={student?.fullName || '?'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary dark:text-text-inverted truncate">
                      {student?.fullName || 'Unknown'}
                    </p>
                    <p className="text-[11px] text-text-muted truncate">
                      {student?.studentId || student?.email} · {inv.role}
                    </p>
                  </div>
                  <div className={cn('flex items-center gap-1 text-[11px] font-semibold', cfg.cls)}>
                    <StatusIcon size={12} />
                    {cfg.label}
                  </div>
                  {inv.status === 'pending' && (
                    <button
                      onClick={() => handleCancelInvite(inv._id)}
                      className="text-text-muted hover:text-danger transition-colors"
                      title="Cancel invite"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Submit Section */}
      <div className="flex items-center justify-between pt-4 border-t border-surface-border dark:border-dark-border gap-4">
        <div className="text-xs text-text-muted">
          {acceptedCount < 2
            ? `Need ${2 - acceptedCount} more acceptance${2 - acceptedCount > 1 ? 's' : ''} to submit`
            : `✓ Ready to submit with ${acceptedCount + 1} members (including you)`}
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmitProposal}
          disabled={!canSubmit || submitting}
          loading={submitting}
          className="shrink-0"
        >
          <ChevronRight size={14} />
          Submit Proposal
        </Button>
      </div>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeamPage() {
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [proposing, setProposing] = useState(false);
  const [proposalSuccess, setProposalSuccess] = useState(false);

  const fetchTeamDetails = useCallback(async () => {
    if (!user?._id) return;
    setLoading(true);
    setError(null);
    try {
      const teamsRes = await teamsApi.getTeams();
      const allTeams = teamsRes.data?.data ?? teamsRes.data?.teams ?? teamsRes.data ?? [];
      const myTeam = Array.isArray(allTeams)
        ? allTeams.find((t) =>
            t.members?.some((m) => (m.user?._id ?? m.userId?._id ?? m.userId ?? m._id) === user._id)
          )
        : null;

      if (!myTeam) { setTeam(null); setLoading(false); return; }
      setTeam(myTeam);

      const [tasksRes, milestonesRes] = await Promise.all([
        tasksApi.getTasks({ team: myTeam._id }),
        milestonesApi.getTimeline(myTeam._id),
      ]);
      setTasks(Array.isArray(tasksRes.data?.data ?? tasksRes.data?.tasks ?? tasksRes.data) ? (tasksRes.data?.data ?? tasksRes.data?.tasks ?? tasksRes.data) : []);
      setMilestones(Array.isArray(milestonesRes.data?.data ?? milestonesRes.data?.milestones ?? milestonesRes.data) ? (milestonesRes.data?.data ?? milestonesRes.data?.milestones ?? milestonesRes.data) : []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to fetch team records.');
    } finally {
      setLoading(false);
    }
  }, [user?._id]);

  useEffect(() => { fetchTeamDetails(); }, [fetchTeamDetails]);

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

  const difficultyVariant = (d) => {
    const v = (d || 'medium').toLowerCase();
    if (v === 'easy') return 'success';
    if (v === 'hard') return 'danger';
    return 'warning';
  };

  return (
    <PageWrapper>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary dark:text-text-inverted">My Team Space</h1>
            {team ? (
              <p className="mt-0.5 text-sm text-text-secondary dark:text-text-muted">
                Collaborate and view progress metrics for team{' '}
                <span className="font-semibold">{team.name}</span>.
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-text-muted">Waiting for team assignment.</p>
            )}
          </div>
          {team && (
            <Button variant="ghost" size="sm" onClick={fetchTeamDetails} disabled={loading}>
              <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
              Refresh
            </Button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-6">
            <SkeletonCard lines={2} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <SkeletonCard lines={4} />
              <SkeletonCard lines={4} />
            </div>
          </div>
        ) : error ? (
          <Card className="p-6">
            <EmptyState
              icon={AlertTriangle}
              title="Error Loading Team"
              description={error}
              action={<Button variant="primary" size="sm" onClick={fetchTeamDetails}>Retry</Button>}
            />
          </Card>
        ) : !team ? (
          /* ── No Team: Show Invite Panel or Entry Card ── */
          <div className="space-y-6 max-w-2xl mx-auto">
            {proposalSuccess && (
              <div className="p-4 rounded-xl border bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800/40 dark:text-green-400 flex items-start gap-3">
                <CheckCircle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Team Proposal Submitted!</p>
                  <p className="text-xs mt-0.5">Pending coordinator approval. Check back soon.</p>
                </div>
              </div>
            )}

            {proposing ? (
              <InvitePanel
                user={user}
                onClose={() => setProposing(false)}
                onProposed={() => { setProposalSuccess(true); setProposing(false); fetchTeamDetails(); }}
              />
            ) : (
              <Card className="p-8">
                <EmptyState
                  icon={Users}
                  title="No Team Allocated"
                  description="You haven't been assigned to a team yet. Gather your team members and send them invitations — they'll receive a notification to accept or decline."
                  action={
                    <Button variant="primary" size="sm" onClick={() => setProposing(true)}>
                      <UserPlus size={14} />
                      Propose a Team
                    </Button>
                  }
                />
              </Card>
            )}
          </div>
        ) : team.status === 'Proposed' ? (
          /* ── Pending Approval ── */
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="p-6 rounded-2xl border border-yellow-200 dark:border-yellow-900/40 bg-yellow-50/50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-400 flex gap-4 shadow-sm">
              <Clock className="shrink-0 mt-0.5 text-yellow-600 dark:text-yellow-500" size={24} />
              <div className="space-y-1">
                <h3 className="text-base font-bold">Team Proposal Pending Approval</h3>
                <p className="text-xs text-yellow-700 dark:text-yellow-500/90 leading-relaxed">
                  Your proposed team{' '}
                  <span className="font-semibold text-yellow-900 dark:text-yellow-300">"{team.name}"</span>{' '}
                  was submitted by{' '}
                  <span className="font-semibold text-yellow-900 dark:text-yellow-300">
                    {team.proposedBy?.fullName || 'the team leader'}
                  </span>{' '}
                  and is awaiting coordinator review.
                </p>
              </div>
            </div>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4 border-b border-surface-border dark:border-dark-border pb-3">
                <div>
                  <span className="text-[10px] font-semibold text-primary dark:text-dark-primaryAccent uppercase tracking-wider block">
                    Team Overview
                  </span>
                  <h2 className="text-xl font-extrabold text-text-primary dark:text-text-inverted">{team.name}</h2>
                </div>
                <Badge variant="warning" className="px-3 py-1 font-semibold">Proposed</Badge>
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Proposed Roster</h4>
                <div className="divide-y divide-surface-border dark:divide-dark-border">
                  {(team.members || []).map((m) => {
                    const info = m.user ?? m.userId ?? m;
                    const name = info.fullName ?? info.name ?? 'Member';
                    const email = info.email ?? '';
                    const studentId = info.studentId ?? '';
                    const role = m.role ?? info.preferredRole ?? 'Contributor';
                    return (
                      <div key={m._id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar name={name} size="md" />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-text-primary dark:text-text-inverted truncate">{name}</p>
                            <p className="text-xs text-text-muted truncate">{studentId ? `${studentId} · ` : ''}{email}</p>
                          </div>
                        </div>
                        <Badge variant={role === 'Project Manager' ? 'primary' : 'gray'} className="uppercase text-[9px] font-bold tracking-wider shrink-0">
                          {role}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>
        ) : (
          /* ── Active Team ── */
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Tasks Completed" value={`${stats.completed} / ${stats.total}`} icon={TrendingUp} color="success" />
              <StatCard label="Pending Milestones" value={stats.pendingMilestones} icon={Calendar} color="warning" />
              <StatCard label="Overall Progress" value={`${stats.progressPercent}%`} icon={Award} color="primary" />
            </div>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-secondary dark:text-text-muted">Team Execution Progress</span>
                <span className="text-xs font-bold text-text-primary dark:text-text-inverted">{stats.progressPercent}%</span>
              </div>
              <ProgressBar value={stats.progressPercent} />
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Members */}
              <div className="lg:col-span-2 space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Team Roster</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(team.members || []).map((m) => {
                    const info = m.user ?? m.userId ?? m;
                    const name = info.fullName ?? info.name ?? 'Member';
                    const email = info.email ?? '';
                    const skills = info.profile?.skills ?? info.skills ?? m.skills ?? [];
                    const availability = info.profile?.availability?.days ?? info.availableDays ?? [];
                    const preferredRole = info.profile?.preferredRole ?? m.role ?? 'Developer';
                    return (
                      <div
                        key={m._id}
                        className="rounded-xl border border-surface-border dark:border-dark-border bg-surface-card dark:bg-dark-card p-5 flex flex-col justify-between hover:shadow-sm transition-shadow"
                      >
                        <div>
                          <div className="flex items-start gap-3.5 mb-3">
                            <Avatar name={name} size="lg" />
                            <div className="min-w-0">
                              <h3 className="font-bold text-text-primary dark:text-text-inverted text-sm truncate">{name}</h3>
                              <span className="text-[10px] font-semibold text-primary dark:text-dark-primaryAccent uppercase tracking-wider">
                                {m.role || preferredRole}
                              </span>
                              <a href={`mailto:${email}`} className="flex items-center gap-1 text-[10px] text-text-muted hover:text-primary mt-1 hover:underline truncate">
                                <Mail size={10} className="shrink-0" />
                                {email}
                              </a>
                            </div>
                          </div>
                          {skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-3 pt-2">
                              {skills.map((skill, idx) => (
                                <Badge key={idx} variant="gray" className="text-[9px] px-1.5 py-0">
                                  {skill.name ?? skill}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        {availability.length > 0 && (
                          <div className="flex items-center gap-1 text-[9px] text-text-muted pt-2 border-t border-surface-border/40 dark:border-dark-border/40">
                            <Clock size={10} />
                            <span className="truncate">Available: {availability.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Project Panel */}
              <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Assigned Project</h2>
                {team.project ?? team.assignedProject ? (
                  <Card className="p-5 flex flex-col gap-4">
                    {(() => {
                      const proj = team.project ?? team.assignedProject;
                      return (
                        <>
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <h3 className="font-bold text-sm text-text-primary dark:text-text-inverted">
                                {proj.title ?? proj.name}
                              </h3>
                              <Badge variant={difficultyVariant(proj.difficulty)}>
                                {proj.difficulty || 'Medium'}
                              </Badge>
                            </div>
                            <p className="text-xs text-text-secondary dark:text-text-muted leading-relaxed line-clamp-6">
                              {proj.description}
                            </p>
                          </div>
                          {Array.isArray(proj.requiredSkills) && proj.requiredSkills.length > 0 && (
                            <div className="border-t border-surface-border dark:border-dark-border pt-3">
                              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Project Skill Scope</p>
                              <div className="flex flex-wrap gap-1">
                                {proj.requiredSkills.map((skill, idx) => (
                                  <Badge key={idx} variant="primary" className="text-[9px] px-1.5 py-0">{skill}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </Card>
                ) : (
                  <Card className="p-5">
                    <EmptyState icon={FolderKanban} title="No Assigned Project" description="No project allocated yet." />
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
