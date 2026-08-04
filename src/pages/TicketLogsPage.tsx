import React, { useEffect, useMemo, useState } from 'react';
import { Archive, CalendarDays, ExternalLink, FileSearch, Search, UserRound, X } from 'lucide-react';
import './ticketLogs.css';

interface TicketLogIndex {
  generatedAt: string;
  ticketCount: number;
  typeCounts: Record<string, number>;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  tickets: TicketLogEntry[];
}

interface TicketLogEntry {
  id: string;
  title: string;
  channelName: string;
  ticketNumber: string;
  ticketType: string;
  sourceFolder: string;
  sourcePath: string;
  fileUrl: string;
  messageCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  authors: string[];
  mentionedUsers: string[];
  preview: string;
  searchableText: string;
}

type SortMode = 'newest' | 'oldest' | 'messages';

const PAGE_SIZE = 40;

const TicketLogsPage: React.FC = () => {
  const [publicArchive, setPublicArchive] = useState<TicketLogIndex | null>(null);
  const [supportArchive, setSupportArchive] = useState<TicketLogIndex | null>(null);
  const [loadError, setLoadError] = useState('');
  const [supportError, setSupportError] = useState('');
  const [isSupportLoginOpen, setIsSupportLoginOpen] = useState(false);
  const [supportUsername, setSupportUsername] = useState('');
  const [supportPassword, setSupportPassword] = useState('');
  const [supportAuthHeader, setSupportAuthHeader] = useState('');
  const [supportTranscriptHtmlByUrl, setSupportTranscriptHtmlByUrl] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [username, setUsername] = useState('');
  const [ticketType, setTicketType] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    fetch('/ticket-log-archive-data/index.json')
      .then(response => {
        if (!response.ok) throw new Error(`Archive index returned ${response.status}`);
        return response.json() as Promise<TicketLogIndex>;
      })
      .then(setPublicArchive)
      .catch(error => {
        console.error('Unable to load ticket archive:', error);
        setLoadError('Ticket archive index could not be loaded.');
      });
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, username, ticketType, startDate, endDate, sortMode]);

  const archive = useMemo(() => mergeArchives(publicArchive, supportArchive), [publicArchive, supportArchive]);
  const ticketTypes = useMemo(() => Object.keys(archive?.typeCounts || {}).sort(), [archive]);
  const usernameOptions = useMemo(() => {
    const names = new Set<string>();
    archive?.tickets.forEach(ticket => {
      ticket.authors.forEach(name => names.add(name));
      ticket.mentionedUsers.forEach(name => names.add(name));
    });
    return Array.from(names).sort((left, right) => left.localeCompare(right));
  }, [archive]);

  const filteredTickets = useMemo(() => {
    const queryTerms = tokenize(query);
    const userTerm = username.toLowerCase();
    const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    const end = endDate ? new Date(`${endDate}T23:59:59`).getTime() : null;

    return (archive?.tickets || [])
      .filter(ticket => {
        const searchText = ticket.searchableText.toLowerCase();
        if (queryTerms.length > 0 && !queryTerms.every(term => searchText.includes(term))) return false;
        if (ticketType !== 'all' && ticket.ticketType !== ticketType) return false;
        if (userTerm && ![...ticket.authors, ...ticket.mentionedUsers].some(name => name.toLowerCase().includes(userTerm))) return false;

        const first = ticket.firstMessageAt ? new Date(ticket.firstMessageAt).getTime() : null;
        const last = ticket.lastMessageAt ? new Date(ticket.lastMessageAt).getTime() : first;
        if (start !== null && last !== null && last < start) return false;
        if (end !== null && first !== null && first > end) return false;
        return true;
      })
      .sort((left, right) => {
        if (sortMode === 'messages') return right.messageCount - left.messageCount;
        const leftTime = new Date(left.lastMessageAt || left.firstMessageAt || 0).getTime();
        const rightTime = new Date(right.lastMessageAt || right.firstMessageAt || 0).getTime();
        return sortMode === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
      });
  }, [archive, query, username, ticketType, startDate, endDate, sortMode]);

  const selectedTicket = filteredTickets.find(ticket => ticket.id === selectedTicketId)
    || archive?.tickets.find(ticket => ticket.id === selectedTicketId)
    || filteredTickets[0]
    || null;
  const isSelectedSupportTicket = selectedTicket?.ticketType === 'Support';
  const selectedSupportTranscriptHtml = selectedTicket ? supportTranscriptHtmlByUrl[selectedTicket.fileUrl] : undefined;

  const visibleTickets = filteredTickets.slice(0, visibleCount);

  useEffect(() => {
    if (!selectedTicket || !isSelectedSupportTicket || !supportAuthHeader || supportTranscriptHtmlByUrl[selectedTicket.fileUrl]) return;

    fetch(selectedTicket.fileUrl, {
      headers: {
        Authorization: supportAuthHeader
      }
    })
      .then(response => {
        if (!response.ok) throw new Error(`Support transcript returned ${response.status}`);
        return response.text();
      })
      .then(html => {
        setSupportTranscriptHtmlByUrl(current => ({
          ...current,
          [selectedTicket.fileUrl]: html
        }));
      })
      .catch(error => {
        console.error('Unable to load support transcript:', error);
        setSupportError('Support transcript could not be loaded.');
      });
  }, [isSelectedSupportTicket, selectedTicket, supportAuthHeader, supportTranscriptHtmlByUrl]);

  async function handleSupportLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const header = buildBasicAuthHeader(supportUsername, supportPassword);
    setSupportError('');

    try {
      const response = await fetch('/ticket-log-support-data/index.json', {
        headers: {
          Authorization: header
        }
      });

      if (!response.ok) {
        throw new Error(`Support archive returned ${response.status}`);
      }

      const nextSupportArchive = await response.json() as TicketLogIndex;
      setSupportArchive(nextSupportArchive);
      setSupportAuthHeader(header);
      setIsSupportLoginOpen(false);
      setSupportUsername('');
      setSupportPassword('');
    } catch (error) {
      console.error('Unable to unlock support tickets:', error);
      setSupportArchive(null);
      setSupportAuthHeader('');
      setSupportError('Support ticket login failed.');
    }
  }

  function handleOpenSelectedTicket() {
    if (!selectedTicket) return;
    window.open(selectedTicket.fileUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="ticket-logs-page">
      <section className="ticket-logs-shell">
        <div className="ticket-logs-heading">
          <div>
            <p className="ticket-logs-kicker">Discord archive</p>
            <h1>Ticket Logs</h1>
            <p>
              Search closed ticket transcripts by user, phrase, ticket type, and date range.
            </p>
          </div>
          <div className="ticket-logs-summary" aria-label="Archive summary">
            <span><Archive aria-hidden />{archive?.ticketCount ?? 0} tickets</span>
            <span><CalendarDays aria-hidden />{formatDateRange(archive?.firstMessageAt, archive?.lastMessageAt)}</span>
            {supportArchive ? (
              <span>Support unlocked</span>
            ) : (
              <button type="button" className="ticket-logs-support-toggle" onClick={() => setIsSupportLoginOpen(open => !open)}>
                View Supp tickets
              </button>
            )}
          </div>
        </div>

        {isSupportLoginOpen && !supportArchive && (
          <form className="ticket-logs-support-login" onSubmit={handleSupportLogin}>
            <label>
              <span>Username</span>
              <input value={supportUsername} onChange={event => setSupportUsername(event.target.value)} autoComplete="username" />
            </label>
            <label>
              <span>Password</span>
              <input value={supportPassword} onChange={event => setSupportPassword(event.target.value)} type="password" autoComplete="current-password" />
            </label>
            <button type="submit">Unlock Support</button>
          </form>
        )}

        {supportError && <div className="ticket-logs-alert">{supportError}</div>}

        <div className="ticket-logs-filters">
          <label className="ticket-logs-search">
            <Search aria-hidden />
            <span className="sr-only">Keyword search</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search keywords, phrases, character names, items..."
            />
          </label>

          <label>
            <span>Username</span>
            <input
              value={username}
              onChange={event => setUsername(event.target.value)}
              list="ticket-log-users"
              placeholder="Any user"
            />
            <datalist id="ticket-log-users">
              {usernameOptions.map(name => <option key={name} value={name} />)}
            </datalist>
          </label>

          <label>
            <span>Ticket type</span>
            <select value={ticketType} onChange={event => setTicketType(event.target.value)}>
              <option value="all">All types</option>
              {ticketTypes.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>

          <label>
            <span>From</span>
            <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} />
          </label>

          <label>
            <span>To</span>
            <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} />
          </label>

          <label>
            <span>Sort</span>
            <select value={sortMode} onChange={event => setSortMode(event.target.value as SortMode)}>
              <option value="newest">Newest activity</option>
              <option value="oldest">Oldest activity</option>
              <option value="messages">Most messages</option>
            </select>
          </label>

          <button
            type="button"
            className="ticket-logs-clear"
            onClick={() => {
              setQuery('');
              setUsername('');
              setTicketType('all');
              setStartDate('');
              setEndDate('');
              setSortMode('newest');
            }}
          >
            <X aria-hidden />
            Clear
          </button>
        </div>

        {loadError ? (
          <div className="ticket-logs-empty">{loadError}</div>
        ) : (
          <div className="ticket-logs-layout">
            <aside className="ticket-logs-results" aria-label="Ticket results">
              <div className="ticket-logs-count">
                <FileSearch aria-hidden />
                <span>{filteredTickets.length} matching tickets</span>
              </div>

              {visibleTickets.length === 0 ? (
                <div className="ticket-logs-empty">No tickets match these filters.</div>
              ) : (
                visibleTickets.map(ticket => (
                  <button
                    type="button"
                    key={ticket.id}
                    className={`ticket-log-result ${selectedTicket?.id === ticket.id ? 'ticket-log-result--active' : ''}`}
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <span className="ticket-log-result__meta">
                      <span>{ticket.ticketType}</span>
                      <span>{formatDate(ticket.lastMessageAt || ticket.firstMessageAt)}</span>
                    </span>
                    <strong>{ticket.channelName}</strong>
                    <span>{buildSnippet(ticket, query)}</span>
                    <span className="ticket-log-result__footer">
                      <span>{ticket.messageCount} messages</span>
                      <span>{ticket.authors.slice(0, 3).join(', ')}</span>
                    </span>
                  </button>
                ))
              )}

              {visibleCount < filteredTickets.length && (
                <button
                  type="button"
                  className="ticket-logs-load-more"
                  onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
                >
                  Load more
                </button>
              )}
            </aside>

            <section className="ticket-log-viewer" aria-label="Selected ticket">
              {selectedTicket ? (
                <>
                  <div className="ticket-log-viewer__header">
                    <div>
                      <p>{selectedTicket.ticketType} ticket</p>
                      <h2>{selectedTicket.channelName}</h2>
                      <span>{formatDateRange(selectedTicket.firstMessageAt, selectedTicket.lastMessageAt)} · {selectedTicket.messageCount} messages</span>
                    </div>
                    <button type="button" onClick={handleOpenSelectedTicket}>
                      <ExternalLink aria-hidden />
                      Open
                    </button>
                  </div>

                  <div className="ticket-log-viewer__details">
                    <span><UserRound aria-hidden />{selectedTicket.authors.slice(0, 8).join(', ') || 'No authors indexed'}</span>
                    <span>{selectedTicket.sourceFolder}</span>
                  </div>

                  {isSelectedSupportTicket ? (
                    selectedSupportTranscriptHtml ? (
                      <iframe
                        key={selectedTicket.fileUrl}
                        title={`Transcript for ${selectedTicket.channelName}`}
                        srcDoc={selectedSupportTranscriptHtml}
                        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                      />
                    ) : (
                      <div className="ticket-logs-empty">Loading support transcript...</div>
                    )
                  ) : (
                    <iframe
                      key={selectedTicket.fileUrl}
                      title={`Transcript for ${selectedTicket.channelName}`}
                      src={selectedTicket.fileUrl}
                      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                    />
                  )}
                </>
              ) : (
                <div className="ticket-logs-empty">Loading ticket archive...</div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
};

function tokenize(value: string) {
  return value.toLowerCase().split(/\s+/).map(term => term.trim()).filter(Boolean);
}

function mergeArchives(publicArchive: TicketLogIndex | null, supportArchive: TicketLogIndex | null): TicketLogIndex | null {
  if (!publicArchive) return supportArchive;
  if (!supportArchive) return publicArchive;

  const tickets = [...publicArchive.tickets, ...supportArchive.tickets];
  const firstDates = tickets.map(ticket => ticket.firstMessageAt).filter(Boolean).sort();
  const lastDates = tickets.map(ticket => ticket.lastMessageAt).filter(Boolean).sort();

  return {
    generatedAt: publicArchive.generatedAt,
    ticketCount: tickets.length,
    typeCounts: {
      ...publicArchive.typeCounts,
      ...supportArchive.typeCounts
    },
    firstMessageAt: firstDates[0] || null,
    lastMessageAt: lastDates[lastDates.length - 1] || null,
    tickets
  };
}

function buildBasicAuthHeader(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function buildSnippet(ticket: TicketLogEntry, query: string) {
  const firstTerm = tokenize(query)[0];
  if (!firstTerm) return ticket.preview;
  const haystack = ticket.searchableText;
  const index = haystack.toLowerCase().indexOf(firstTerm);
  if (index < 0) return ticket.preview;
  const start = Math.max(0, index - 90);
  return `${start > 0 ? '...' : ''}${haystack.slice(start, start + 220)}...`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return 'No dates';
  if (!start || start === end) return formatDate(end || start);
  return `${formatDate(start)} - ${formatDate(end)}`;
}

export default TicketLogsPage;
