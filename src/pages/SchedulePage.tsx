import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Clock, Copy, Loader2, Plus, Save, Trash2, Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ScheduleService from '../services/scheduleService';
import { ScheduleAvailability, SchedulePoll } from '../types/database';

interface PollSlot {
  key: string;
  startsAt: Date;
  pollDate: string;
  pollMinutes: number;
  windowMinutes: number;
}

type DragMode = 'add' | 'remove' | null;

interface ScheduleGridColumn {
  key: string;
  label: string;
}

interface ScheduleGridRow {
  key: string;
  label: string;
}

interface ScheduleGrid {
  columns: ScheduleGridColumn[];
  rows: ScheduleGridRow[];
  slotByCell: Map<string, PollSlot>;
}

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const timezoneOptions = getTimezoneOptions();

const SchedulePage: React.FC = () => {
  const { pollId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const scheduleService = useMemo(() => ScheduleService.getInstance(), []);
  const [polls, setPolls] = useState<SchedulePoll[]>([]);
  const [selectedPoll, setSelectedPoll] = useState<SchedulePoll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [viewerTimezone, setViewerTimezone] = useState(browserTimezone);
  const [availableSlotKeys, setAvailableSlotKeys] = useState<Set<string>>(new Set());
  const [hoveredSlotKey, setHoveredSlotKey] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [newPoll, setNewPoll] = useState({
    title: '',
    description: '',
    timezone: browserTimezone,
    dateStart: getTodayInputValue(),
    dateEnd: getDateInputValue(3),
    noEarlierThan: '18:00',
    noLaterThan: '23:00',
    slotMinutes: 30 as 15 | 30 | 60
  });

  useEffect(() => {
    if (!selectedPoll || !user?.id) {
      setAvailableSlotKeys(new Set());
      return;
    }

    const participant = selectedPoll.participants.find(item => item.userId === user.id);
    if (participant) {
      setViewerTimezone(participant.timezone);
    }

    setAvailableSlotKeys(new Set(
      selectedPoll.availability
        .filter(slot => slot.userId === user.id)
        .map(slot => slot.slotKey)
    ));
  }, [selectedPoll, user?.id]);

  useEffect(() => {
    if (!dragMode) return;

    const stopDragging = () => setDragMode(null);
    window.addEventListener('pointerup', stopDragging);

    return () => window.removeEventListener('pointerup', stopDragging);
  }, [dragMode]);

  const slots = useMemo(() => selectedPoll ? buildPollSlots(selectedPoll) : [], [selectedPoll]);
  const scheduleGrid = useMemo(() => buildScheduleGrid(slots, viewerTimezone), [slots, viewerTimezone]);
  const availabilityBySlot = useMemo(() => buildAvailabilityMap(selectedPoll?.availability || []), [selectedPoll?.availability]);
  const currentHover = hoveredSlotKey && selectedPoll
    ? getHoverDetails(hoveredSlotKey, selectedPoll, availabilityBySlot)
    : null;
  const selectedSlot = selectedPoll?.selectedSlotKey
    ? slots.find(slot => slot.key === selectedPoll.selectedSlotKey)
    : undefined;
  const isCreator = Boolean(selectedPoll && user?.id === selectedPoll.creatorId);
  const maxAvailability = Math.max(1, ...Array.from(availabilityBySlot.values()).map(value => value.size));

  const loadPolls = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await scheduleService.getPolls();
      if (response.success && response.data) {
        setPolls(response.data);
        const pollFromRoute = pollId ? response.data.find(poll => poll._id === pollId) : null;
        setSelectedPoll(pollFromRoute || response.data[0] || null);
      } else {
        console.error('Failed to load schedule polls:', response.error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [pollId, scheduleService]);

  useEffect(() => {
    loadPolls();
  }, [loadPolls]);

  const handleCreatePoll = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;

    const startMinutes = timeToMinutes(newPoll.noEarlierThan);
    const endMinutes = timeToMinutes(newPoll.noLaterThan);

    const result = await scheduleService.createPoll({
      title: newPoll.title,
      description: newPoll.description,
      creatorId: user.id,
      timezone: newPoll.timezone,
      dateStart: newPoll.dateStart,
      dateEnd: newPoll.dateEnd,
      startMinutes,
      endMinutes,
      slotMinutes: newPoll.slotMinutes
    });

    if (result.success && result.data) {
      setShowCreatePoll(false);
      setNewPoll(prev => ({ ...prev, title: '', description: '' }));
      await loadPolls();
      navigate(`/schedule/${result.data._id}`);
    } else {
      alert(result.error || 'Failed to create poll');
    }
  };

  const toggleSlot = (slotKey: string, forcedMode?: DragMode) => {
    setAvailableSlotKeys(prev => {
      const next = new Set(prev);
      const mode = forcedMode || (next.has(slotKey) ? 'remove' : 'add');
      if (mode === 'add') {
        next.add(slotKey);
      } else {
        next.delete(slotKey);
      }

      return next;
    });
  };

  const handleSlotMouseDown = (slotKey: string) => {
    const mode: DragMode = availableSlotKeys.has(slotKey) ? 'remove' : 'add';
    setDragMode(mode);
    toggleSlot(slotKey, mode);
  };

  const handleGridPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMode) return;

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const slotButton = target?.closest<HTMLButtonElement>('[data-slot-key]');
    const slotKey = slotButton?.dataset.slotKey;
    if (slotKey) {
      toggleSlot(slotKey, dragMode);
      setHoveredSlotKey(slotKey);
    }
  };

  const handleSaveAvailability = async () => {
    if (!selectedPoll?._id || !user?.id) return;

    setIsSaving(true);
    try {
      const participantResponse = await scheduleService.upsertParticipant({
        pollId: selectedPoll._id,
        userId: user.id,
        displayName: user.username,
        timezone: viewerTimezone
      });

      if (!participantResponse.success || !participantResponse.data?._id) {
        alert(participantResponse.error || 'Failed to save participant');
        return;
      }

      const slotsToSave = slots
        .filter(slot => availableSlotKeys.has(slot.key))
        .map(slot => ({ slotKey: slot.key, slotStart: slot.startsAt }));
      const availabilityResponse = await scheduleService.saveAvailability(
        selectedPoll._id,
        participantResponse.data._id,
        user.id,
        slotsToSave
      );

      if (availabilityResponse.success) {
        await loadPolls();
      } else {
        alert(availabilityResponse.error || 'Failed to save availability');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectSlot = async (slot: PollSlot) => {
    if (!selectedPoll?._id || !user?.id) return;

    const result = await scheduleService.selectSlot(selectedPoll._id, user.id, slot.key, slot.startsAt);
    if (result.success) {
      await loadPolls();
    } else {
      alert(result.error || 'Failed to select time slot');
    }
  };

  const handleCopyLink = async () => {
    if (!selectedPoll?._id) return;

    const link = `${window.location.origin}/schedule/${selectedPoll._id}`;
    await navigator.clipboard.writeText(link);
  };

  const handleClosePoll = async (poll: SchedulePoll) => {
    if (!poll._id || !user?.id || poll.creatorId !== user.id) return;

    const confirmed = window.confirm(`Close "${poll.title}"? It will disappear from the active polls list.`);
    if (!confirmed) return;

    const result = await scheduleService.closePoll(poll._id, user.id);
    if (result.success) {
      await loadPolls();
      if (selectedPoll?._id === poll._id) {
        navigate('/schedule');
      }
    } else {
      alert(result.error || 'Failed to close poll');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <CalendarDays className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
          <h1 className="font-fantasy text-4xl font-bold text-white mb-6">Game Scheduling</h1>
          <p className="text-xl text-gray-300">Please log in to create and answer scheduling polls.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-fantasy text-4xl font-bold text-white mb-2">Game Scheduling</h1>
            <p className="text-gray-300">Build a shared availability map before the game listing exists.</p>
          </div>
          <button
            onClick={() => setShowCreatePoll(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Create Poll</span>
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 text-yellow-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-300">Loading scheduling polls...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
            <aside className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-4 h-fit">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="w-5 h-5 text-yellow-400" />
                <h2 className="text-lg font-bold text-white">Polls</h2>
              </div>
              <div className="space-y-2">
                {polls.map(poll => (
                  <div
                    key={poll._id}
                    className={`flex items-start gap-2 rounded-lg border p-2 transition-colors ${
                      selectedPoll?._id === poll._id
                        ? 'bg-yellow-500/15 border-yellow-400/70'
                        : 'bg-fantasy-800/30 border-fantasy-700/30 hover:bg-fantasy-800/50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPoll(poll);
                        navigate(`/schedule/${poll._id}`);
                      }}
                      className="min-w-0 flex-1 rounded-md p-1 text-left"
                    >
                      <p className="truncate text-white font-semibold">{poll.title}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDateRange(poll.dateStart, poll.dateEnd)} - {poll.participants.length} players
                      </p>
                    </button>
                    {poll.creatorId === user?.id && (
                      <button
                        type="button"
                        onClick={() => handleClosePoll(poll)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-900/40 text-red-200 hover:bg-red-800/70 hover:text-white"
                        aria-label={`Close ${poll.title}`}
                        title="Close poll"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {polls.length === 0 && (
                  <div className="text-center py-8">
                    <Clock className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-300">No scheduling polls yet.</p>
                  </div>
                )}
              </div>
            </aside>

            {selectedPoll ? (
              <section className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-4 sm:p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                  <div>
                    <h2 className="font-fantasy text-3xl font-bold text-white mb-2">{selectedPoll.title}</h2>
                    {selectedPoll.description && (
                      <p className="text-gray-300 max-w-3xl">{selectedPoll.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-3 text-sm text-gray-400">
                      <span>{formatDateRange(selectedPoll.dateStart, selectedPoll.dateEnd)}</span>
                      <span>{formatTimeWindow(selectedPoll.startMinutes, selectedPoll.endMinutes)} {selectedPoll.timezone}</span>
                      <span>{selectedPoll.slotMinutes} minute slots</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-2 px-4 py-2 bg-fantasy-700 hover:bg-fantasy-600 text-white rounded-lg"
                    >
                      <Copy className="w-4 h-4" />
                      <span>Copy Link</span>
                    </button>
                    <button
                      onClick={handleSaveAvailability}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white rounded-lg"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span>Save</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <label className="text-sm text-gray-300">
                        Timezone
                        <select
                          value={viewerTimezone}
                          onChange={(event) => setViewerTimezone(event.target.value)}
                          className="block mt-1 w-full sm:w-80 p-2 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                        >
                          {timezoneOptions.map(timezone => (
                            <option key={timezone} value={timezone}>{timezone}</option>
                          ))}
                        </select>
                      </label>
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <span className="w-4 h-4 rounded bg-emerald-900/70 border border-emerald-600/50" />
                        <span>Fewer available</span>
                        <span className="w-4 h-4 rounded bg-emerald-300 border border-emerald-200" />
                        <span>Most available</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto pb-2">
                      <div
                        className="grid min-w-[640px] select-none gap-1"
                        style={{ gridTemplateColumns: `72px repeat(${scheduleGrid.columns.length}, minmax(88px, 1fr))` }}
                        onPointerMove={handleGridPointerMove}
                      >
                        <div className="sticky left-0 z-20 rounded border border-fantasy-700/30 bg-fantasy-900/95" />
                        {scheduleGrid.columns.map(column => (
                          <div
                            key={column.key}
                            className="min-h-11 rounded border border-fantasy-700/30 bg-fantasy-800/60 px-2 py-2 text-center text-xs font-bold text-white sm:text-sm"
                          >
                            {column.label}
                          </div>
                        ))}

                        {scheduleGrid.rows.map(row => (
                          <React.Fragment key={row.key}>
                            <div className="sticky left-0 z-10 flex min-h-12 items-center justify-end rounded border border-fantasy-700/30 bg-fantasy-900/95 px-2 text-xs font-semibold text-gray-300">
                              {row.label}
                            </div>
                            {scheduleGrid.columns.map(column => {
                              const slot = scheduleGrid.slotByCell.get(getGridCellKey(column.key, row.key));
                              if (!slot) {
                                return (
                                  <div
                                    key={`${column.key}-${row.key}`}
                                    className="min-h-12 rounded border border-fantasy-800/30 bg-midnight-900/30"
                                  />
                                );
                              }

                              const count = availabilityBySlot.get(slot.key)?.size || 0;
                              const isAvailable = availableSlotKeys.has(slot.key);
                              const isSelected = selectedPoll.selectedSlotKey === slot.key;

                              return (
                                <button
                                  key={slot.key}
                                  type="button"
                                  data-slot-key={slot.key}
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    handleSlotMouseDown(slot.key);
                                  }}
                                  onPointerEnter={() => setHoveredSlotKey(slot.key)}
                                  onFocus={() => setHoveredSlotKey(slot.key)}
                                  className={`min-h-12 touch-none rounded border px-1 text-xs font-bold text-white transition-all ${
                                    isAvailable ? 'border-yellow-300 ring-2 ring-yellow-300/60' : 'border-fantasy-700/30'
                                  } ${isSelected ? 'outline outline-2 outline-white' : ''}`}
                                  style={{ backgroundColor: getSlotBackground(count, maxAvailability) }}
                                  title={`${formatDateTime(slot.startsAt, viewerTimezone)} - ${count} available`}
                                >
                                  <span className="block">{count}</span>
                                </button>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </div>

                  <aside className="space-y-4">
                    <div className="bg-fantasy-800/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="w-5 h-5 text-yellow-400" />
                        <h3 className="text-white font-bold">Hover Details</h3>
                      </div>
                      {currentHover ? (
                        <div>
                          <p className="text-sm text-gray-300 mb-3">{formatDateTime(currentHover.slot.startsAt, viewerTimezone)}</p>
                          <p className="text-sm font-semibold text-emerald-300 mb-1">Available</p>
                          <ul className="mb-3 space-y-1 text-sm text-gray-200">
                            {currentHover.availableNames.length > 0
                              ? currentHover.availableNames.map(name => <li key={name}>{name}</li>)
                              : <li className="text-gray-400">No one yet</li>}
                          </ul>
                          <p className="text-sm font-semibold text-red-300 mb-1">Not Available</p>
                          <ul className="space-y-1 text-sm text-gray-200">
                            {currentHover.unavailableNames.length > 0
                              ? currentHover.unavailableNames.map(name => <li key={name}>{name}</li>)
                              : <li className="text-gray-400">No saved participants missing this slot</li>}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-300">Hover over a slot to see player lists.</p>
                      )}
                    </div>

                    <div className="bg-fantasy-800/30 rounded-lg p-4">
                      <h3 className="text-white font-bold mb-2">Selected Slot</h3>
                      {selectedSlot ? (
                        <div className="text-sm text-gray-300">
                          <p>{formatDateTime(selectedSlot.startsAt, viewerTimezone)}</p>
                          <p className="mt-1">{availabilityBySlot.get(selectedSlot.key)?.size || 0} available players</p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-300">No slot selected yet.</p>
                      )}
                    </div>

                    {isCreator && (
                      <div className="bg-fantasy-800/30 rounded-lg p-4">
                        <h3 className="text-white font-bold mb-3">Organizer Choice</h3>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {[...slots]
                            .sort((first, second) => (availabilityBySlot.get(second.key)?.size || 0) - (availabilityBySlot.get(first.key)?.size || 0))
                            .slice(0, 12)
                            .map(slot => (
                              <button
                                key={slot.key}
                                onClick={() => handleSelectSlot(slot)}
                                className="w-full flex items-center justify-between gap-3 p-2 bg-fantasy-900/50 hover:bg-fantasy-900/80 rounded-lg text-left"
                              >
                                <span className="text-sm text-white">{formatDateTime(slot.startsAt, viewerTimezone)}</span>
                                <span className="flex items-center gap-1 text-sm text-emerald-300">
                                  {selectedPoll.selectedSlotKey === slot.key && <Check className="w-4 h-4" />}
                                  {availabilityBySlot.get(slot.key)?.size || 0}
                                </span>
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </aside>
                </div>
              </section>
            ) : (
              <section className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-10 text-center">
                <CalendarDays className="w-14 h-14 text-gray-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Create the first poll</h2>
                <p className="text-gray-300">Pick the date range and table hours, then invite players to add availability.</p>
              </section>
            )}
          </div>
        )}

        {showCreatePoll && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleCreatePoll} className="bg-fantasy-900 border border-fantasy-700 rounded-xl p-6 max-w-2xl w-full space-y-4">
              <h2 className="text-2xl font-bold text-white">Create Scheduling Poll</h2>
              <input
                type="text"
                value={newPoll.title}
                onChange={(event) => setNewPoll(prev => ({ ...prev, title: event.target.value }))}
                required
                placeholder="Poll title"
                className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400"
              />
              <textarea
                value={newPoll.description}
                onChange={(event) => setNewPoll(prev => ({ ...prev, description: event.target.value }))}
                rows={3}
                placeholder="Game pitch or scheduling notes"
                className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 resize-none"
              />
              <select
                value={newPoll.timezone}
                onChange={(event) => setNewPoll(prev => ({ ...prev, timezone: event.target.value }))}
                className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
              >
                {timezoneOptions.map(timezone => (
                  <option key={timezone} value={timezone}>{timezone}</option>
                ))}
              </select>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="text-sm text-gray-300">
                  Date range starts
                  <input
                    type="date"
                    value={newPoll.dateStart}
                    onChange={(event) => setNewPoll(prev => ({ ...prev, dateStart: event.target.value }))}
                    required
                    className="block mt-1 w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                  />
                </label>
                <label className="text-sm text-gray-300">
                  Date range ends
                  <input
                    type="date"
                    value={newPoll.dateEnd}
                    min={newPoll.dateStart}
                    onChange={(event) => setNewPoll(prev => ({ ...prev, dateEnd: event.target.value }))}
                    required
                    className="block mt-1 w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                  />
                </label>
                <label className="text-sm text-gray-300">
                  No earlier than
                  <input
                    type="time"
                    value={newPoll.noEarlierThan}
                    onChange={(event) => setNewPoll(prev => ({ ...prev, noEarlierThan: event.target.value }))}
                    required
                    className="block mt-1 w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                  />
                </label>
                <label className="text-sm text-gray-300">
                  No later than
                  <input
                    type="time"
                    value={newPoll.noLaterThan}
                    onChange={(event) => setNewPoll(prev => ({ ...prev, noLaterThan: event.target.value }))}
                    required
                    className="block mt-1 w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                  />
                </label>
              </div>
              <label className="text-sm text-gray-300">
                Slot size
                <select
                  value={newPoll.slotMinutes}
                  onChange={(event) => setNewPoll(prev => ({ ...prev, slotMinutes: Number(event.target.value) as 15 | 30 | 60 }))}
                  className="block mt-1 w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreatePoll(false)}
                  className="flex-1 px-4 py-3 bg-fantasy-700 hover:bg-fantasy-600 text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg"
                >
                  Create Poll
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

const buildPollSlots = (poll: SchedulePoll): PollSlot[] => {
  const slots: PollSlot[] = [];
  const dates = getDateRange(poll.dateStart, poll.dateEnd);
  const isOvernight = poll.endMinutes <= poll.startMinutes;

  dates.forEach(date => {
    const ranges = isOvernight
      ? [
        { start: poll.startMinutes, end: 1440, windowOffset: 0 },
        { start: 0, end: poll.endMinutes, windowOffset: 1440 }
      ]
      : [{ start: poll.startMinutes, end: poll.endMinutes, windowOffset: 0 }];

    ranges.forEach(range => {
      for (let minutes = range.start; minutes < range.end; minutes += poll.slotMinutes) {
        const hour = Math.floor(minutes / 60);
        const minute = minutes % 60;
        const key = `${date}T${pad(hour)}:${pad(minute)}`;
        slots.push({
          key,
          startsAt: zonedTimeToUtc(date, minutes, poll.timezone),
          pollDate: date,
          pollMinutes: minutes,
          windowMinutes: minutes + range.windowOffset
        });
      }
    });
  });

  return slots;
};

const buildScheduleGrid = (slots: PollSlot[], timezone: string): ScheduleGrid => {
  const columns = new Map<string, ScheduleGridColumn>();
  const rows = new Map<string, ScheduleGridRow>();
  const slotByCell = new Map<string, PollSlot>();

  slots.forEach(slot => {
    const localParts = getLocalDateTimeParts(slot.startsAt, timezone);
    const columnKey = localParts.dateKey;
    const rowKey = String(localParts.minutes);
    if (!columns.has(columnKey)) {
      columns.set(columnKey, {
        key: columnKey,
        label: formatGridDate(slot.startsAt, timezone)
      });
    }
    if (!rows.has(rowKey)) {
      rows.set(rowKey, {
        key: rowKey,
        label: formatMinutesLabel(localParts.minutes)
      });
    }
    slotByCell.set(getGridCellKey(columnKey, rowKey), slot);
  });

  return {
    columns: Array.from(columns.values()),
    rows: Array.from(rows.values()),
    slotByCell
  };
};

const buildAvailabilityMap = (availability: ScheduleAvailability[]) => {
  const map = new Map<string, Set<string>>();

  availability.forEach(slot => {
    const userIds = map.get(slot.slotKey) || new Set<string>();
    userIds.add(slot.userId);
    map.set(slot.slotKey, userIds);
  });

  return map;
};

const getHoverDetails = (
  slotKey: string,
  poll: SchedulePoll,
  availabilityBySlot: Map<string, Set<string>>
) => {
  const availableUserIds = availabilityBySlot.get(slotKey) || new Set<string>();
  const slot = buildPollSlots(poll).find(item => item.key === slotKey);
  const participantsByUser = new Map(poll.participants.map(participant => [participant.userId, participant.displayName]));
  const availableNames = Array.from(availableUserIds).map(userId => participantsByUser.get(userId) || 'Unknown player');
  const unavailableNames = poll.participants
    .filter(participant => !availableUserIds.has(participant.userId))
    .map(participant => participant.displayName);

  return {
    slot: slot || buildPollSlots(poll)[0],
    availableNames,
    unavailableNames
  };
};

const zonedTimeToUtc = (dateValue: string, minutes: number, timezone: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let index = 0; index < 3; index += 1) {
    const offset = getTimezoneOffsetMs(new Date(utcGuess), timezone);
    utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
  }

  return new Date(utcGuess);
};

const getTimezoneOffsetMs = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));

  return Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  ) - date.getTime();
};

const getDateRange = (start: string, end: string) => {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);

  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
};

const getSlotBackground = (count: number, maxCount: number) => {
  if (count === 0) return 'rgba(30, 41, 59, 0.65)';

  const intensity = count / maxCount;
  const lightness = 18 + Math.round(intensity * 48);
  return `hsl(145 72% ${lightness}%)`;
};

const getGridCellKey = (columnKey: string, rowKey: string) => `${columnKey}|${rowKey}`;

const getLocalDateTimeParts = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));

  return {
    dateKey: `${values.year}-${pad(values.month)}-${pad(values.day)}`,
    minutes: values.hour * 60 + values.minute
  };
};

const formatGridDate = (date: Date, timezone: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: timezone
  }).format(date);

const formatMinutesLabel = (minutes: number) => {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = ((hour24 + 11) % 12) + 1;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:${pad(minute)} ${period}`;
};

const formatDateTime = (date: Date, timezone: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short'
  }).format(date);

const formatDateRange = (start: string, end: string) =>
  start === end ? start : `${start} to ${end}`;

const formatTimeWindow = (startMinutes: number, endMinutes: number) => {
  const nextDayText = endMinutes <= startMinutes ? ' next day' : '';
  return `${minutesToTime(startMinutes)}-${minutesToTime(endMinutes)}${nextDayText}`;
};

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

const getTodayInputValue = () => getDateInputValue(0);

const getDateInputValue = (daysFromNow: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
};

function getTimezoneOptions() {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[];
  };
  const supportedTimezones = intlWithSupportedValues.supportedValuesOf?.('timeZone') || [];
  const commonTimezones = [
    'UTC',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'Europe/London',
    'Europe/Berlin',
    'Australia/Sydney'
  ];

  return Array.from(new Set([browserTimezone, ...commonTimezones, ...supportedTimezones])).sort();
}

const pad = (value: number) => String(value).padStart(2, '0');

export default SchedulePage;
