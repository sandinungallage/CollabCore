import { useMemo, useState } from 'react';
import { CheckCircle2, Palette, Shield, Bell, User, Save, MoonStar, SunMedium, KeyRound, Phone, BookUser, GraduationCap } from 'lucide-react';
import { PageWrapper } from '../../components/layout';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useNotifications } from '../../context/NotificationContext';
import * as authApi from '../../api/auth';
import { Badge, Button, Card, EmptyState } from '../../components/common';
import { cn } from '../../utils/helpers';

const roleHints = {
  coordinator: {
    title: 'Coordinator settings',
    description: 'Review account preferences and system controls for cohort management.',
  },
  student: {
    title: 'Student settings',
    description: 'Update your profile, availability, and notification preferences.',
  },
  mentor: {
    title: 'Mentor settings',
    description: 'Adjust your profile, password, and notification preferences.',
  },
};

const notificationDefaults = {
  evaluations: true,
  milestones: true,
  teamUpdates: true,
  systemMessages: true,
};

function getSavedNotificationPrefs() {
  try {
    const raw = localStorage.getItem('collabcore-notification-prefs');
    return raw ? { ...notificationDefaults, ...JSON.parse(raw) } : notificationDefaults;
  } catch {
    return notificationDefaults;
  }
}

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const { unreadCount } = useNotifications();

  const roleInfo = roleHints[user?.role] || roleHints.student;

  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);
  const [passwordMessage, setPasswordMessage] = useState(null);
  const [notificationPrefs, setNotificationPrefs] = useState(getSavedNotificationPrefs);
  const [profileForm, setProfileForm] = useState({
    phone: user?.phone || '',
    bio: user?.bio || '',
    faculty: user?.faculty || '',
    yearOfStudy: user?.yearOfStudy || '',
    availabilityHours: user?.availabilityHours || '',
    preferredRole: user?.preferredRole || 'No Preference',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const profileFields = useMemo(() => {
    const common = [
      { key: 'phone', label: 'Phone number', icon: Phone, placeholder: '+1 555 000 0000' },
      { key: 'bio', label: 'Bio', icon: User, placeholder: 'Short intro about yourself', multiline: true },
    ];

    if (user?.role === 'student') {
      return [
        ...common,
        { key: 'faculty', label: 'Faculty', icon: GraduationCap, placeholder: 'Faculty / Department' },
        { key: 'yearOfStudy', label: 'Year of study', icon: BookUser, placeholder: '1-4' },
        { key: 'availabilityHours', label: 'Availability hours per week', icon: Bell, placeholder: 'e.g. 20' },
        { key: 'preferredRole', label: 'Preferred role', icon: User, placeholder: 'Project Manager / Developer / ...' },
      ];
    }

    if (user?.role === 'mentor') {
      return [
        ...common,
        { key: 'faculty', label: 'Faculty', icon: GraduationCap, placeholder: 'Faculty / Department' },
      ];
    }

    return common;
  }, [user?.role]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const payload = {
        phone: profileForm.phone,
        bio: profileForm.bio,
      };

      if (user?.role === 'student') {
        payload.faculty = profileForm.faculty;
        payload.yearOfStudy = profileForm.yearOfStudy ? Number(profileForm.yearOfStudy) : undefined;
        payload.availabilityHours = profileForm.availabilityHours ? Number(profileForm.availabilityHours) : undefined;
        payload.preferredRole = profileForm.preferredRole;
      }

      if (user?.role === 'mentor') {
        payload.faculty = profileForm.faculty;
      }

      await updateUser(payload);
      setProfileMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err) {
      setProfileMessage({ type: 'error', text: err?.response?.data?.message || 'Failed to update profile.' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordMessage(null);
    try {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error('New password and confirmation do not match.');
      }

      await authApi.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordMessage({ type: 'success', text: 'Password changed successfully.' });
    } catch (err) {
      setPasswordMessage({ type: 'error', text: err?.response?.data?.message || err.message || 'Failed to change password.' });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleNotificationToggle = (key) => {
    setNotificationPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('collabcore-notification-prefs', JSON.stringify(next));
      return next;
    });
  };

  return (
    <PageWrapper>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary dark:text-text-inverted">Settings</h1>
            <p className="mt-0.5 text-sm text-text-secondary dark:text-text-muted">{roleInfo.description}</p>
          </div>
          <Badge variant="gray" className="w-fit">{user?.role || 'unknown'}</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-5 lg:col-span-2 space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary-light dark:bg-dark-primaryLight flex items-center justify-center">
                <User size={18} className="text-primary dark:text-dark-primaryAccent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary dark:text-text-inverted">Profile</h2>
                <p className="text-xs text-text-muted">Update account details stored in your profile.</p>
              </div>
            </div>

            {profileMessage && (
              <div className={cn('rounded-lg px-3 py-2 text-sm', profileMessage.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400')}>
                {profileMessage.text}
              </div>
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Email</span>
                  <input
                    value={user?.email || ''}
                    className="w-full rounded-lg border border-surface-border dark:border-dark-border bg-surface-bg dark:bg-dark-elevated px-3 py-2 text-sm text-text-muted"
                    disabled
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {profileFields.map((field) => (
                  <label key={field.key} className={cn('space-y-1.5', field.multiline && 'sm:col-span-2')}>
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                      <field.icon size={12} />
                      {field.label}
                    </span>
                    {field.multiline ? (
                      <textarea
                        value={profileForm[field.key]}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        rows={4}
                        placeholder={field.placeholder}
                        className="w-full rounded-lg border border-surface-border dark:border-dark-border bg-surface-bg dark:bg-dark-elevated px-3 py-2 text-sm text-text-primary dark:text-text-inverted"
                      />
                    ) : (
                      <input
                        value={profileForm[field.key]}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        className="w-full rounded-lg border border-surface-border dark:border-dark-border bg-surface-bg dark:bg-dark-elevated px-3 py-2 text-sm text-text-primary dark:text-text-inverted"
                        placeholder={field.placeholder}
                      />
                    )}
                  </label>
                ))}
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="primary" size="sm" loading={profileSaving}>
                  <Save size={14} />
                  Save Profile
                </Button>
              </div>
            </form>
          </Card>

          <div className="space-y-6">
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-surface-input dark:bg-dark-elevated flex items-center justify-center">
                  {isDark ? <MoonStar size={18} /> : <SunMedium size={18} />}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary dark:text-text-inverted">Appearance</h2>
                  <p className="text-xs text-text-muted">Theme preference is saved locally.</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={toggleTheme} className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Palette size={14} />
                  Theme
                </span>
                <span className="text-xs font-semibold text-text-muted">{theme === 'dark' ? 'Dark' : 'Light'}</span>
              </Button>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary-light dark:bg-dark-primaryLight flex items-center justify-center">
                  <Bell size={18} className="text-primary dark:text-dark-primaryAccent" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary dark:text-text-inverted">Notifications</h2>
                  <p className="text-xs text-text-muted">Saved in your browser for now.</p>
                </div>
              </div>

              <div className="space-y-2">
                {Object.keys(notificationDefaults).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleNotificationToggle(key)}
                    className="w-full flex items-center justify-between rounded-lg border border-surface-border dark:border-dark-border px-3 py-2 text-sm hover:bg-surface-bg dark:hover:bg-dark-elevated transition-colors"
                  >
                    <span className="capitalize text-text-secondary dark:text-text-muted">{key.replace(/([A-Z])/g, ' $1')}</span>
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', notificationPrefs[key] ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-surface-input text-text-muted dark:bg-dark-elevated')}>
                      {notificationPrefs[key] ? 'On' : 'Off'}
                    </span>
                  </button>
                ))}
              </div>

              <p className="text-xs text-text-muted">Unread notifications: {unreadCount}</p>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-surface-input dark:bg-dark-elevated flex items-center justify-center">
                  <KeyRound size={18} className="text-text-secondary dark:text-text-muted" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary dark:text-text-inverted">Security</h2>
                  <p className="text-xs text-text-muted">Change your account password.</p>
                </div>
              </div>

              {passwordMessage && (
                <div className={cn('rounded-lg px-3 py-2 text-sm', passwordMessage.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400')}>
                  {passwordMessage.text}
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                  placeholder="Current password"
                  className="w-full rounded-lg border border-surface-border dark:border-dark-border bg-surface-bg dark:bg-dark-elevated px-3 py-2 text-sm text-text-primary dark:text-text-inverted"
                />
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                  placeholder="New password"
                  className="w-full rounded-lg border border-surface-border dark:border-dark-border bg-surface-bg dark:bg-dark-elevated px-3 py-2 text-sm text-text-primary dark:text-text-inverted"
                />
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Confirm new password"
                  className="w-full rounded-lg border border-surface-border dark:border-dark-border bg-surface-bg dark:bg-dark-elevated px-3 py-2 text-sm text-text-primary dark:text-text-inverted"
                />
                <Button type="submit" variant="primary" size="sm" loading={passwordSaving} className="w-full justify-center">
                  <Shield size={14} />
                  Change Password
                </Button>
              </form>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={18} className="text-success" />
                <div>
                  <h2 className="text-base font-semibold text-text-primary dark:text-text-inverted">Account overview</h2>
                  <p className="text-xs text-text-muted">Your current role and profile state.</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-surface-bg dark:bg-dark-elevated p-3">
                  <p className="text-xs text-text-muted uppercase tracking-wider">Role</p>
                  <p className="font-semibold text-text-primary dark:text-text-inverted capitalize">{user?.role || 'Unknown'}</p>
                </div>
                <div className="rounded-lg bg-surface-bg dark:bg-dark-elevated p-3">
                  <p className="text-xs text-text-muted uppercase tracking-wider">Unread</p>
                  <p className="font-semibold text-text-primary dark:text-text-inverted">{unreadCount}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}