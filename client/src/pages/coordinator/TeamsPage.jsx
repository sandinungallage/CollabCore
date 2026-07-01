import { useState, useEffect, useCallback } from 'react';
import {
  UsersRound,
  Play,
  RefreshCw,
  Eye,
  Trash2,
  AlertTriangle,
  Award,
  ChevronRight,
  CheckCircle,
  Plus,
  X,
  Settings,
  Search,
} from 'lucide-react';
import * as teamsApi from '../../api/teams';
import * as usersApi from '../../api/users';
import * as mentorsApi from '../../api/mentors';
import { PageWrapper } from '../../components/layout';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  ProgressBar,
  SkeletonCard,
  StatCard,
} from '../../components/common';
import { cn } from '../../utils/helpers';

function getTeamProgress(team) {
  return (
    team.progress ??
    team.overallProgress ??
    team.completionRate ??
    team.progressPercentage ??
    0
  );
}

function getRiskLevel(team) {
  const risk = team.riskLevel ?? team.risk;
  if (risk) return String(risk).toLowerCase();
  const progress = getTeamProgress(team);
  if (progress < 20) return 'high';
  if (progress < 45) return 'medium';
  return 'low';
}

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forming, setForming] = useState(false);
  const [formationResult, setFormationResult] = useState(null);

  // Modal State
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Member Edit State
  const [isEditingMembers, setIsEditingMembers] = useState(false);
  const [editedMembers, setEditedMembers] = useState([]);
  const [unassignedStudents, setUnassignedStudents] = useState([]);
  const [studentToAdd, setStudentToAdd] = useState('');
  const [roleToAdd, setRoleToAdd] = useState('Software Developer');
  const [savingMembers, setSavingMembers] = useState(false);
  const [approving, setApproving] = useState(false);

  // Mentor Assignment State
  const [allMentors, setAllMentors] = useState([]);
  const [mentorSearchQuery, setMentorSearchQuery] = useState('');

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await teamsApi.getTeams();
      const data = res.data?.data ?? res.data?.teams ?? res.data ?? [];
      setTeams(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch teams:', err);
      setError(err?.response?.data?.message || 'Failed to load teams.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMentors = useCallback(async () => {
    try {
      const res = await mentorsApi.getMentors();
      const data = res.data?.data ?? res.data ?? [];
      setAllMentors(data);
    } catch (err) {
      console.error('Failed to fetch mentors:', err);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
    fetchMentors();
  }, [fetchTeams, fetchMentors]);

  const handleRunFormation = async () => {
    setForming(true);
    setFormationResult(null);
    try {
      const res = await teamsApi.runFormation({});
      setFormationResult({
        success: true,
        message: res.data?.message || 'Team formation completed successfully!',
      });
      fetchTeams();
    } catch (err) {
      console.error('Failed to run team formation:', err);
      setFormationResult({
        success: false,
        message: err?.response?.data?.message || 'Failed to run team formation.',
      });
    } finally {
      setForming(false);
    }
  };

  const handleDeleteTeam = async (id) => {
    if (!window.confirm('Are you sure you want to delete this team?')) return;
    setDeletingId(id);
    try {
      await teamsApi.deleteTeam(id);
      setTeams((prev) => prev.filter((t) => t._id !== id));
      if (selectedTeam?._id === id) {
        setModalOpen(false);
      }
    } catch (err) {
      console.error('Failed to delete team:', err);
      alert('Failed to delete team.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleViewTeamDetails = (team) => {
    setSelectedTeam(team);
    setModalOpen(true);
  };

  const handleStartEditMembers = async () => {
    setEditedMembers(selectedTeam.members || []);
    setIsEditingMembers(true);
    try {
      const res = await usersApi.getUsers({ role: 'student', teamStatus: 'unassigned', limit: 100 });
      const data = res.data?.data || res.data || [];
      const list = data.users || data.students || data.results || data.data || (Array.isArray(data) ? data : []);
      setUnassignedStudents(list);
    } catch (err) {
      console.error('Failed to fetch unassigned students:', err);
    }
  };

  const handleAddMember = () => {
    if (!studentToAdd) return;
    const student = unassignedStudents.find((s) => s._id === studentToAdd);
    if (!student) return;

    // Check if already added
    const alreadyAdded = editedMembers.some(
      (m) => (m.user?._id ?? m.user ?? m.userId?._id ?? m.userId ?? m._id) === studentToAdd
    );
    if (alreadyAdded) return;

    // Add to local state
    setEditedMembers((prev) => [
      ...prev,
      {
        user: student,
        role: roleToAdd,
      },
    ]);
    setStudentToAdd('');
  };

  const handleRemoveMember = (studentId) => {
    setEditedMembers((prev) =>
      prev.filter(
        (m) => (m.user?._id ?? m.user ?? m.userId?._id ?? m.userId ?? m._id) !== studentId
      )
    );
  };

  const handleSaveMembers = async () => {
    setSavingMembers(true);
    try {
      const payload = editedMembers.map((m) => ({
        user: m.user?._id ?? m.user ?? m.userId?._id ?? m.userId ?? m._id,
        role: m.role || 'Contributor',
      }));

      const res = await teamsApi.overrideTeam(selectedTeam._id, { members: payload });
      const updatedTeam = res.data?.data ?? res.data?.team ?? res.data;

      // Update state
      setTeams((prev) => prev.map((t) => (t._id === selectedTeam._id ? updatedTeam : t)));
      setSelectedTeam(updatedTeam);
      setIsEditingMembers(false);
    } catch (err) {
      console.error('Failed to save team members:', err);
      alert(err.message || 'Failed to update members.');
    } finally {
      setSavingMembers(false);
    }
  };

  const handleApproveTeam = async (id) => {
    if (!window.confirm('Are you sure you want to approve and form this proposed team?')) return;
    setApproving(true);
    try {
      const res = await teamsApi.approveTeam(id);
      const updated = res.data?.data ?? res.data?.team ?? res.data;
      
      setTeams((prev) => prev.map((t) => (t._id === id ? updated : t)));
      setSelectedTeam(updated);
      alert('Team approved and formed successfully!');
    } catch (err) {
      console.error('Failed to approve team:', err);
      alert(err?.response?.data?.message || 'Failed to approve team.');
    } finally {
      setApproving(false);
    }
  };

  // Helper score styling
  const getScoreColor = (score) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'danger';
  };

  // Derived stats
  const totalTeams = teams.length;
  const avgSuitability = teams.length
    ? Math.round(
        teams.reduce((acc, t) => acc + (t.suitabilityScore ?? t.score ?? 0), 0) /
          teams.length
      )
    : 0;
  const totalMembers = teams.reduce((acc, t) => acc + (t.members?.length || 0), 0);

  return (
    <PageWrapper>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary dark:text-text-inverted">
              Team Management
            </h1>
            <p className="mt-0.5 text-sm text-text-secondary dark:text-text-muted">
              Analyze automatically formed teams or run the formation algorithm.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchTeams} disabled={loading}>
              <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
              Reload
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRunFormation}
              loading={forming}
              disabled={forming}
            >
              <Play size={14} />
              Run Team Formation
            </Button>
          </div>
        </div>

        {/* Formation Result Banner */}
        {formationResult && (
          <div
            className={cn(
              'p-4 rounded-xl border flex items-start gap-3',
              formationResult.success
                ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800/40 dark:text-green-400'
                : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800/40 dark:text-red-400'
            )}
          >
            {formationResult.success ? (
              <CheckCircle size={18} className="shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold">{formationResult.message}</p>
            </div>
            <button
              onClick={() => setFormationResult(null)}
              className="text-xs font-semibold opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Overview Stats */}
        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total Teams" value={totalTeams} icon={UsersRound} color="primary" />
            <StatCard
              label="Avg. Suitability Score"
              value={`${avgSuitability}%`}
              icon={Award}
              color={getScoreColor(avgSuitability)}
            />
            <StatCard label="Students in Teams" value={totalMembers} icon={UsersRound} color="info" />
          </div>
        )}

        {/* Main Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} lines={3} />
            ))}
          </div>
        ) : error ? (
          <Card className="p-6">
            <EmptyState
              icon={AlertTriangle}
              title="Error Loading Teams"
              description={error}
              action={
                <Button variant="primary" size="sm" onClick={fetchTeams}>
                  Try Again
                </Button>
              }
            />
          </Card>
        ) : teams.length === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={UsersRound}
              title="No Teams Found"
              description="Run the Team Formation algorithm to automatically group students into optimal teams."
              action={
                <Button variant="primary" size="sm" onClick={handleRunFormation} loading={forming}>
                  <Play size={14} />
                  Run Formation
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => {
              const score = team.suitabilityScore ?? team.score ?? 0;
              const project = team.projectName ?? team.project?.title ?? team.project?.name ?? 'Unassigned';
              const isAllocated = !!team.project;
              const isProposed = team.status === 'Proposed';
              const progress = getTeamProgress(team);
              const risk = getRiskLevel(team);
              const riskFlags = Array.isArray(team.riskFlags) ? team.riskFlags : [];

              return (
                <div
                  key={team._id}
                  className={cn(
                    "rounded-xl border shadow-sm p-5 bg-surface-card border-surface-border dark:bg-dark-card dark:border-dark-border flex flex-col justify-between hover:shadow-md transition-shadow group",
                    isProposed && "border-warning/50 dark:border-warning/30 bg-warning/5 dark:bg-warning/5 border-dashed"
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-semibold text-text-primary dark:text-text-inverted truncate">
                        {team.name}
                      </h3>
                      <div className="flex items-center gap-1.5">
                        {isProposed && (
                          <Badge variant="warning" className="text-[10px] font-bold">
                            Proposed
                          </Badge>
                        )}
                        <Badge variant={getScoreColor(score)}>
                          {score}% Match
                        </Badge>
                      </div>
                    </div>

                    <p className="text-xs text-text-muted dark:text-text-muted mb-4 truncate">
                      Project: <span className="font-medium text-text-secondary dark:text-text-muted">{project}</span>
                    </p>

                    <div className="mb-4 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-text-muted">
                        <span>Overall Progress</span>
                        <span className={cn(risk === 'high' ? 'text-danger' : risk === 'medium' ? 'text-warning' : 'text-success', 'font-semibold')}>
                          {progress}%
                        </span>
                      </div>
                      <ProgressBar value={progress} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <Badge variant={risk === 'high' ? 'danger' : risk === 'medium' ? 'warning' : 'success'}>
                        {risk === 'high' ? 'High Risk' : risk === 'medium' ? 'Medium Risk' : 'On Track'}
                      </Badge>
                      {riskFlags.slice(0, 2).map((flag) => (
                        <Badge key={flag} variant="gray" className="text-[10px]">
                          {flag}
                        </Badge>
                      ))}
                    </div>

                    {/* Member Avatars */}
                    <div className="flex items-center -space-x-2 mb-4 overflow-hidden">
                      {(team.members || []).slice(0, 4).map((m, idx) => (
                        <Avatar
                          key={m._id ?? idx}
                          name={m.name || m.userId?.name || 'Member'}
                          size="sm"
                          className="border-2 border-surface-card dark:border-dark-card"
                        />
                      ))}
                      {(team.members || []).length > 4 && (
                        <div className="h-8 w-8 rounded-full bg-surface-input dark:bg-dark-elevated text-text-muted flex items-center justify-center text-xs font-semibold border-2 border-surface-card dark:border-dark-card">
                          +{(team.members || []).length - 4}
                        </div>
                      )}
                      {(team.members || []).length === 0 && (
                        <p className="text-xs italic text-text-muted">No members yet</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-surface-border dark:border-dark-border pt-3 mt-2">
                    <button
                      onClick={() => handleViewTeamDetails(team)}
                      className="text-xs font-semibold text-primary dark:text-dark-primaryAccent flex items-center gap-0.5 hover:underline"
                    >
                      <Eye size={13} />
                      View Details
                    </button>

                    <button
                      onClick={() => handleDeleteTeam(team._id)}
                      disabled={deletingId === team._id}
                      className="text-xs font-semibold text-danger hover:underline flex items-center gap-0.5 disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedTeam && (
        <Modal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedTeam(null);
            setIsEditingMembers(false);
          }}
          title={selectedTeam.name}
          size="lg"
          footer={
            isEditingMembers ? (
              <div className="flex items-center gap-2 justify-end w-full">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingMembers(false)}
                  disabled={savingMembers}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveMembers}
                  loading={savingMembers}
                  disabled={savingMembers}
                >
                  Save Changes
                </Button>
              </div>
            ) : selectedTeam.status === 'Proposed' ? (
              <div className="flex items-center gap-2 justify-end w-full">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteTeam(selectedTeam._id)}
                  disabled={approving}
                  className="hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20"
                >
                  Reject Proposal
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleApproveTeam(selectedTeam._id)}
                  loading={approving}
                  disabled={approving}
                >
                  Approve Team
                </Button>
              </div>
            ) : null
          }
        >
          <div className="space-y-6">
            {selectedTeam.status === 'Proposed' && (
              <div className="p-4 rounded-xl border border-yellow-200 dark:border-yellow-900/40 bg-yellow-50/50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-400 flex items-start gap-3 shadow-sm animate-fade-in">
                <AlertTriangle size={18} className="shrink-0 mt-0.5 text-yellow-600 dark:text-yellow-500" />
                <div>
                  <p className="text-xs font-bold text-yellow-900 dark:text-yellow-300">
                    Proposed Team Review
                  </p>
                  <p className="text-[11px] mt-0.5 leading-relaxed text-yellow-700 dark:text-yellow-400/90">
                    This team was proposed by <span className="font-semibold">{selectedTeam.proposedBy?.fullName || 'the team leader'}</span>. Review the member roster and match scores below. If all conditions are met, click <strong>Approve Team</strong> to activate the team space.
                  </p>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                Team Suitability Profile
              </h4>
              <div className="flex items-center gap-4 bg-surface-input dark:bg-dark-elevated/40 p-4 rounded-lg border border-surface-border dark:border-dark-border">
                <div className="text-center">
                  <span className="text-3xl font-extrabold text-text-primary dark:text-text-inverted">
                    {selectedTeam.suitabilityScore ?? selectedTeam.score ?? 0}%
                  </span>
                  <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mt-0.5">
                    Match Score
                  </p>
                </div>
                <div className="h-10 w-[1px] bg-surface-border dark:bg-dark-border" />
                <div className="flex-1">
                  <p className="text-xs text-text-secondary dark:text-text-muted leading-relaxed">
                    This score is based on technical skill coverage, availability overlaps, and student role preferences within this group.
                  </p>
                </div>
              </div>
            </div>

            {selectedTeam.mlScore !== null && selectedTeam.mlScore !== undefined && (
              <div className="animate-fade-in">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                  AI Team Quality Prediction
                </h4>
                <div className="flex items-center gap-4 bg-primary/5 dark:bg-dark-primaryAccent/5 p-4 rounded-lg border border-primary/20 dark:border-dark-primaryAccent/20">
                  <div className="text-center">
                    <span className="text-3xl font-extrabold text-primary dark:text-dark-primaryAccent">
                      {selectedTeam.mlScore}%
                    </span>
                    <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mt-0.5">
                      Quality Score
                    </p>
                  </div>
                  <div className="h-10 w-[1px] bg-primary/20 dark:bg-dark-primaryAccent/20" />
                  <div className="flex-1">
                    <p className="text-xs text-text-secondary dark:text-text-muted leading-relaxed">
                      AI Model predicts this team as <span className={cn("font-bold", selectedTeam.mlLabel === "Good" ? "text-success" : "text-danger")}>{selectedTeam.mlLabel}</span>. This is based on ML ensemble predictions of historical team compositions and success rates.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isEditingMembers ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Manage Team Members ({editedMembers.length})
                  </h4>
                </div>
                <div className="space-y-2 mb-4">
                  {editedMembers.map((member, idx) => {
                    const mUser = member.user ?? member.userId ?? member;
                    const name = mUser.fullName ?? mUser.name ?? 'Member';
                    const email = mUser.email ?? '';
                    const role = member.role ?? 'Contributor';

                    return (
                      <div
                        key={mUser._id ?? idx}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-surface-border dark:border-dark-border bg-surface-card dark:bg-dark-card"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={name} size="sm" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-text-primary dark:text-text-inverted truncate">
                              {name}
                            </p>
                            <span className="text-[10px] text-text-muted truncate block">
                              {email}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={role}
                            onChange={(e) => {
                              const newRole = e.target.value;
                              setEditedMembers((prev) =>
                                prev.map((m, i) => (i === idx ? { ...m, role: newRole } : m))
                              );
                            }}
                            className="text-[11px] px-2 py-1 rounded bg-surface-input dark:bg-dark-input border border-surface-border dark:border-dark-border text-text-primary dark:text-text-inverted focus:ring-1 focus:ring-primary outline-none"
                          >
                            {['Project Manager', 'Software Developer', 'UI/UX Designer', 'QA Tester', 'Business Analyst', 'Contributor'].map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleRemoveMember(mUser._id ?? mUser)}
                            className="p-1 rounded-md text-danger hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {editedMembers.length === 0 && (
                    <p className="text-xs text-text-muted italic p-2 text-center border border-dashed border-surface-border rounded-lg">
                      No members. Add students below.
                    </p>
                  )}
                </div>

                <div className="p-3.5 bg-surface-input dark:bg-dark-elevated/40 border border-surface-border dark:border-dark-border rounded-xl space-y-3">
                  <p className="text-xs font-semibold text-text-secondary dark:text-text-muted font-bold">
                    Add Student to Team
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={studentToAdd}
                      onChange={(e) => setStudentToAdd(e.target.value)}
                      className="text-xs w-full px-3 py-2 rounded-lg bg-surface-card dark:bg-dark-card border border-surface-border dark:border-dark-border text-text-primary dark:text-text-inverted focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="">Select student...</option>
                      {unassignedStudents
                        .filter((s) => !editedMembers.some((m) => (m.user?._id ?? m.user ?? m.userId?._id ?? m.userId ?? m._id) === s._id))
                        .map((student) => (
                          <option key={student._id} value={student._id}>
                            {student.fullName ?? student.name} ({student.studentId || student.email})
                          </option>
                        ))}
                    </select>

                    <select
                      value={roleToAdd}
                      onChange={(e) => setRoleToAdd(e.target.value)}
                      className="text-xs w-full px-3 py-2 rounded-lg bg-surface-card dark:bg-dark-card border border-surface-border dark:border-dark-border text-text-primary dark:text-text-inverted focus:ring-1 focus:ring-primary outline-none"
                    >
                      {['Project Manager', 'Software Developer', 'UI/UX Designer', 'QA Tester', 'Business Analyst', 'Contributor'].map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAddMember}
                    disabled={!studentToAdd}
                    className="w-full flex items-center justify-center gap-1"
                  >
                    <Plus size={13} />
                    Add Member
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Team Members ({selectedTeam.members?.length || 0})
                  </h4>
                  <button
                    onClick={handleStartEditMembers}
                    className="text-xs font-semibold text-primary dark:text-dark-primaryAccent hover:underline flex items-center gap-1"
                  >
                    <Settings size={13} />
                    Manage Members
                  </button>
                </div>
                <div className="space-y-3">
                  {(selectedTeam.members || []).map((member, idx) => {
                    const mUser = member.user ?? member.userId ?? member;
                    const name = mUser.fullName ?? mUser.name ?? 'Member';
                    const email = mUser.email ?? '';
                    const role = member.role || mUser.role || 'Contributor';
                    const skills = mUser.profile?.skills ?? member.skills ?? [];

                    return (
                      <div
                        key={mUser._id ?? idx}
                        className="flex items-start justify-between gap-4 p-3 rounded-lg border border-surface-border dark:border-dark-border bg-surface-card dark:bg-dark-card hover:bg-surface-bg dark:hover:bg-dark-elevated/20 transition-colors"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <Avatar name={name} size="md" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-text-primary dark:text-text-inverted truncate">
                              {name}
                            </p>
                            <p className="text-xs text-text-muted truncate mb-1">
                              {email}
                            </p>
                            {skills.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {skills.map((skill, idx) => (
                                  <Badge key={idx} variant="gray" className="text-[10px] px-1.5 py-0">
                                    {skill.name ?? skill}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <Badge variant="primary" className="shrink-0 uppercase text-[9px] tracking-wider font-semibold">
                          {role}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedTeam.project && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                  Assigned Project Details
                </h4>
                <div className="p-4 rounded-lg border border-surface-border dark:border-dark-border bg-surface-card dark:bg-dark-card">
                  <h5 className="font-semibold text-sm text-text-primary dark:text-text-inverted mb-1">
                    {selectedTeam.project.title ?? selectedTeam.project.name}
                  </h5>
                  <p className="text-xs text-text-secondary dark:text-text-muted leading-relaxed">
                    {selectedTeam.project.description}
                  </p>
                </div>
              </div>
            )}

            {/* Mentor Assignment Section */}
            {selectedTeam.status !== 'Proposed' && (
              <div className="border-t border-surface-border dark:border-dark-border pt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                  Mentor Assignment
                </h4>
                
                {/* Current Mentor */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-surface-border dark:border-dark-border bg-surface-card dark:bg-dark-card mb-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={selectedTeam.mentor?.fullName || 'No Mentor'} size="sm" />
                    <div>
                      <p className="text-xs font-semibold text-text-primary dark:text-text-inverted">
                        {selectedTeam.mentor?.fullName || 'Unassigned'}
                      </p>
                      <span className="text-[10px] text-text-muted block">
                        {selectedTeam.mentor?.email || 'No mentor assigned to this team.'}
                      </span>
                    </div>
                  </div>
                  {selectedTeam.mentor && (
                    <button
                      onClick={async () => {
                        if (window.confirm('Are you sure you want to remove the mentor from this team?')) {
                          try {
                            const res = await teamsApi.overrideTeam(selectedTeam._id, { mentor: null });
                            const updatedTeam = res.data?.data ?? res.data?.team ?? res.data;
                            setTeams((prev) => prev.map((t) => (t._id === selectedTeam._id ? updatedTeam : t)));
                            setSelectedTeam(updatedTeam);
                            alert('Mentor removed successfully!');
                          } catch (err) {
                            console.error('Failed to remove mentor:', err);
                            alert(err?.response?.data?.message || 'Failed to remove mentor.');
                          }
                        }
                      }}
                      className="text-xs text-danger hover:underline font-semibold"
                    >
                      Unassign
                    </button>
                  )}
                </div>

                {/* Search Bar for Mentors */}
                <div className="relative">
                  <label className="block text-[11px] font-medium text-text-secondary dark:text-text-muted mb-1.5 font-bold">
                    Search & Assign Mentor
                  </label>
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                    />
                    <input
                      type="text"
                      value={mentorSearchQuery}
                      onChange={(e) => setMentorSearchQuery(e.target.value)}
                      placeholder="Type mentor's name or email to search..."
                      className={cn(
                        'w-full pl-9 pr-8 py-2 text-xs rounded-lg border outline-none transition-colors',
                        'bg-surface-input border-surface-border text-text-primary placeholder:text-text-muted',
                        'dark:bg-dark-input dark:border-dark-border dark:text-text-inverted',
                        'focus:border-primary dark:focus:border-dark-primaryAccent'
                      )}
                    />
                    {mentorSearchQuery && (
                      <button
                        onClick={() => setMentorSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary dark:hover:text-text-inverted transition-colors"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Suggestions List */}
                  {mentorSearchQuery.trim() && (
                    <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-surface-border dark:border-dark-border bg-surface-card dark:bg-dark-card shadow-lg divide-y divide-surface-border dark:divide-dark-border">
                      {allMentors.filter((m) => {
                        const q = mentorSearchQuery.toLowerCase().trim();
                        return m.fullName?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
                      }).length > 0 ? (
                        allMentors
                          .filter((m) => {
                            const q = mentorSearchQuery.toLowerCase().trim();
                            return m.fullName?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
                          })
                          .map((mentor) => (
                            <div
                              key={mentor._id}
                              className="flex items-center justify-between p-2.5 hover:bg-surface-bg dark:hover:bg-dark-elevated/20 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar name={mentor.fullName} size="xs" />
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-text-primary dark:text-text-inverted truncate">
                                    {mentor.fullName}
                                  </p>
                                  <p className="text-[10px] text-text-muted truncate">
                                    {mentor.email}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await mentorsApi.assignTeamToMentor(mentor._id, selectedTeam._id);
                                    const updatedTeam = res.data?.data ?? res.data?.team ?? res.data;
                                    setTeams((prev) => prev.map((t) => (t._id === selectedTeam._id ? updatedTeam : t)));
                                    setSelectedTeam(updatedTeam);
                                    setMentorSearchQuery('');
                                    alert(`Successfully assigned ${mentor.fullName} as mentor!`);
                                  } catch (err) {
                                    console.error('Failed to assign mentor:', err);
                                    alert(err?.response?.data?.message || 'Failed to assign mentor.');
                                  }
                                }}
                                className="text-xs font-semibold text-primary dark:text-dark-primaryAccent hover:underline px-2 py-1 bg-primary/10 dark:bg-dark-primaryAccent/10 rounded"
                              >
                                Assign
                              </button>
                            </div>
                          ))
                      ) : (
                        <p className="text-xs text-text-muted italic p-3 text-center">
                          No mentors found matching your search.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </PageWrapper>
  );
}
