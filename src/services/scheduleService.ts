import DatabaseService from './database';
import { DATABASE_TABLES } from '../config/database';
import { ApiResponse, ScheduleAvailability, ScheduleParticipant, SchedulePoll } from '../types/database';

export interface CreateSchedulePollInput {
  title: string;
  description: string;
  creatorId: string;
  timezone: string;
  dateStart: string;
  dateEnd: string;
  startMinutes: number;
  endMinutes: number;
  slotMinutes: 15 | 30 | 60;
}

export interface ScheduleParticipantInput {
  pollId: string;
  userId: string;
  displayName: string;
  timezone: string;
}

class ScheduleService {
  private static instance: ScheduleService;
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  static getInstance(): ScheduleService {
    if (!ScheduleService.instance) {
      ScheduleService.instance = new ScheduleService();
    }

    return ScheduleService.instance;
  }

  async getPolls(): Promise<ApiResponse<SchedulePoll[]>> {
    try {
      const today = getLocalDateValue();
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.SCHEDULE_POLLS)
        .select(`
          *,
          participants:schedule_participants(*),
          availability:schedule_availability(*)
        `)
        .eq('status', 'Open')
        .gte('date_end', today)
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: (data || []).map(poll => this.transformPollFromDb(poll))
      };
    } catch (error) {
      console.error('Error loading schedule polls:', error);
      return { success: false, error: 'Failed to load schedule polls' };
    }
  }

  async getPollById(pollId: string): Promise<ApiResponse<SchedulePoll>> {
    try {
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.SCHEDULE_POLLS)
        .select(`
          *,
          participants:schedule_participants(*),
          availability:schedule_availability(*)
        `)
        .eq('id', pollId)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: this.transformPollFromDb(data)
      };
    } catch (error) {
      console.error('Error loading schedule poll:', error);
      return { success: false, error: 'Failed to load schedule poll' };
    }
  }

  async createPoll(input: CreateSchedulePollInput): Promise<ApiResponse<SchedulePoll>> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.SCHEDULE_POLLS)
        .insert({
          title: input.title,
          description: input.description,
          creator_id: input.creatorId,
          timezone: input.timezone,
          date_start: input.dateStart,
          date_end: input.dateEnd,
          start_minutes: input.startMinutes,
          end_minutes: input.endMinutes,
          slot_minutes: input.slotMinutes,
          created_at: now,
          updated_at: now
        })
        .select(`
          *,
          participants:schedule_participants(*),
          availability:schedule_availability(*)
        `)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: this.transformPollFromDb(data),
        message: 'Scheduling poll created.'
      };
    } catch (error) {
      console.error('Error creating schedule poll:', error);
      return { success: false, error: 'Failed to create schedule poll' };
    }
  }

  async upsertParticipant(input: ScheduleParticipantInput): Promise<ApiResponse<ScheduleParticipant>> {
    try {
      const now = new Date().toISOString();
      const { data, error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.SCHEDULE_PARTICIPANTS)
        .upsert({
          poll_id: input.pollId,
          user_id: input.userId,
          display_name: input.displayName,
          timezone: input.timezone,
          updated_at: now
        }, { onConflict: 'poll_id,user_id' })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: this.transformParticipantFromDb(data)
      };
    } catch (error) {
      console.error('Error saving schedule participant:', error);
      return { success: false, error: 'Failed to save participant' };
    }
  }

  async saveAvailability(
    pollId: string,
    participantId: string,
    userId: string,
    slots: Array<{ slotKey: string; slotStart: Date }>
  ): Promise<ApiResponse<boolean>> {
    try {
      const supabase = this.dbService.getClient();
      const { error: deleteError } = await supabase
        .from(DATABASE_TABLES.SCHEDULE_AVAILABILITY)
        .delete()
        .eq('poll_id', pollId)
        .eq('participant_id', participantId)
        .eq('user_id', userId);

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }

      if (slots.length === 0) {
        return { success: true, data: true, message: 'Availability cleared.' };
      }

      const { error: insertError } = await supabase
        .from(DATABASE_TABLES.SCHEDULE_AVAILABILITY)
        .insert(slots.map(slot => ({
          poll_id: pollId,
          participant_id: participantId,
          user_id: userId,
          slot_key: slot.slotKey,
          slot_start: slot.slotStart.toISOString()
        })));

      if (insertError) {
        return { success: false, error: insertError.message };
      }

      return { success: true, data: true, message: 'Availability saved.' };
    } catch (error) {
      console.error('Error saving schedule availability:', error);
      return { success: false, error: 'Failed to save availability' };
    }
  }

  async selectSlot(
    pollId: string,
    creatorId: string,
    slotKey: string,
    slotStart: Date
  ): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.SCHEDULE_POLLS)
        .update({
          selected_slot_key: slotKey,
          selected_slot_start: slotStart.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', pollId)
        .eq('creator_id', creatorId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: true, message: 'Time slot selected.' };
    } catch (error) {
      console.error('Error selecting schedule slot:', error);
      return { success: false, error: 'Failed to select time slot' };
    }
  }

  async closePoll(pollId: string, creatorId: string): Promise<ApiResponse<boolean>> {
    try {
      const { error } = await this.dbService.getClient()
        .from(DATABASE_TABLES.SCHEDULE_POLLS)
        .update({
          status: 'Closed',
          updated_at: new Date().toISOString()
        })
        .eq('id', pollId)
        .eq('creator_id', creatorId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: true, message: 'Poll closed.' };
    } catch (error) {
      console.error('Error closing schedule poll:', error);
      return { success: false, error: 'Failed to close poll' };
    }
  }

  private transformPollFromDb(dbPoll: Record<string, unknown>): SchedulePoll {
    const participants = Array.isArray(dbPoll.participants)
      ? dbPoll.participants.map(participant => this.transformParticipantFromDb(participant as Record<string, unknown>))
      : [];
    const availability = Array.isArray(dbPoll.availability)
      ? dbPoll.availability.map(slot => this.transformAvailabilityFromDb(slot as Record<string, unknown>))
      : [];

    return {
      _id: String(dbPoll.id),
      title: String(dbPoll.title || ''),
      description: String(dbPoll.description || ''),
      creatorId: String(dbPoll.creator_id),
      timezone: String(dbPoll.timezone || 'UTC'),
      dateStart: String(dbPoll.date_start),
      dateEnd: String(dbPoll.date_end),
      startMinutes: Number(dbPoll.start_minutes),
      endMinutes: Number(dbPoll.end_minutes),
      slotMinutes: Number(dbPoll.slot_minutes || 30) as 15 | 30 | 60,
      status: String(dbPoll.status || 'Open') as 'Open' | 'Closed',
      selectedSlotKey: dbPoll.selected_slot_key ? String(dbPoll.selected_slot_key) : undefined,
      selectedSlotStart: dbPoll.selected_slot_start ? new Date(String(dbPoll.selected_slot_start)) : undefined,
      participants,
      availability,
      createdAt: new Date(String(dbPoll.created_at)),
      updatedAt: new Date(String(dbPoll.updated_at))
    };
  }

  private transformParticipantFromDb(dbParticipant: Record<string, unknown>): ScheduleParticipant {
    return {
      _id: String(dbParticipant.id),
      pollId: String(dbParticipant.poll_id),
      userId: String(dbParticipant.user_id),
      displayName: String(dbParticipant.display_name || 'Adventurer'),
      timezone: String(dbParticipant.timezone || 'UTC'),
      createdAt: new Date(String(dbParticipant.created_at)),
      updatedAt: new Date(String(dbParticipant.updated_at))
    };
  }

  private transformAvailabilityFromDb(dbAvailability: Record<string, unknown>): ScheduleAvailability {
    return {
      _id: String(dbAvailability.id),
      pollId: String(dbAvailability.poll_id),
      participantId: String(dbAvailability.participant_id),
      userId: String(dbAvailability.user_id),
      slotKey: String(dbAvailability.slot_key),
      slotStart: new Date(String(dbAvailability.slot_start)),
      createdAt: new Date(String(dbAvailability.created_at))
    };
  }
}

const getLocalDateValue = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default ScheduleService;
