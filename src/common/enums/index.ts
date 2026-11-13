/** Incident severity — drives who is notified. Independent of staff capability. */
export enum AlertLevel {
  LOW = 1,
  MID = 2,
  HIGH = 3,
  ULTRA = 4,
}

/** What a staff member is allowed to do. Independent of alert severity. */
export enum StaffCategory {
  CAT_1 = 1,
  CAT_2 = 2,
  CAT_3 = 3,
}

/** Group membership for announcement targeting. */
export enum UserCategory {
  UNIVERSITY_MANAGEMENT = 'university_management',
  FIRE_RESPONSE_TEAM = 'fire_response_team',
  SECURITY = 'security',
  STUDENT_AFFAIRS = 'student_affairs',
  MEDICAL = 'medical',
  INCIDENT_REPORTER = 'incident_reporter',
  DISPATCHER = 'dispatcher',
  GENERAL = 'general',
}

export enum IncidentStatus {
  REPORTED = 'reported',
  INTERVENTION_ONGOING = 'intervention_ongoing',
  RESOLVED = 'resolved',
}

export enum IncidentType {
  FIRE = 'fire',
  FIGHT = 'fight',
  ONGOING_CRIME = 'ongoing_crime',
  SUSPICIOUS_MOVEMENT = 'suspicious_movement',
  ACCIDENT = 'accident',
  INVASION = 'invasion',
  VIOLENT_ATTACK = 'violent_attack',
}

export enum IncidentChannel {
  APP_BUTTON = 'app_button',
  RAPID_SOS = 'rapid_sos',
  DISPATCHER_PHONE = 'dispatcher_phone',
  SMS = 'sms',
  USSD = 'ussd',
  VISITOR = 'visitor',
}

export enum AssignmentStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
  COMPLETED = 'completed',
}

export enum RejectionReason {
  CURRENTLY_BUSY = 'currently_busy',
  TOO_FAR = 'too_far',
  OTHER = 'other',
}

export enum Permission {
  READ_MESSAGES = 'read_messages',
  VIEW_MUSTER_MAP = 'view_muster_map',
  VIEW_NAVIGATION_MAP = 'view_navigation_map',
  ACCEPT_REJECT_INTERVENTION = 'accept_reject_intervention',
  CONFIRM_OR_ESCALATE_ASSIGNED = 'confirm_or_escalate_assigned',
  CLOSE_INCIDENT = 'close_incident',
  MONITOR_INTERVENTION_MAP = 'monitor_intervention_map',
  PUSH_ANNOUNCEMENTS_OWN = 'push_announcements_own',
  PUSH_ANNOUNCEMENTS_ANY = 'push_announcements_any',
  VIEW_ANALYTICS = 'view_analytics',
  DISPATCH_ASSIGN = 'dispatch_assign',
  LEVEL4_ESCALATE = 'level4_escalate',
  MANAGE_USERS = 'manage_users',
}

export enum NotificationChannel {
  FCM = 'fcm',
  SMS = 'sms',
  IN_APP = 'in_app',
}

export enum AuditAction {
  INCIDENT_CREATED = 'incident.created',
  INCIDENT_STATUS_CHANGED = 'incident.status_changed',
  ASSIGNMENT_CREATED = 'assignment.created',
  ASSIGNMENT_ACCEPTED = 'assignment.accepted',
  ASSIGNMENT_REJECTED = 'assignment.rejected',
  ASSIGNMENT_WITHDRAWN = 'assignment.withdrawn',
  ESCALATION_PROMPTED = 'escalation.prompted',
  ESCALATION_AUTO = 'escalation.auto',
  ESCALATION_MANUAL = 'escalation.manual',
  ESCALATION_LEVEL4 = 'escalation.level4',
  INCIDENT_RESOLVED = 'incident.resolved',
  INCIDENT_DETAILS_ADDED = 'incident.details_added',
  ANNOUNCEMENT_SENT = 'announcement.sent',
  AUTH_LOGIN = 'auth.login',
  AUTH_FAILED = 'auth.failed',
}
