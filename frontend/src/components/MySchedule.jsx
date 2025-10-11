import { useEffect, useMemo, useState } from "react";
import BandCard from "./BandCard";

function MySchedule({
  bands,
  onToggleBand,
  onClearSchedule,
  showPast,
  onToggleShowPast,
}) {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  const effectiveNow = useMemo(() => currentTime, [currentTime]);
  const highlightedBandIds = useMemo(
    () => new Set(["ba-johnston", "blackout", "handheld"]),
    []
  );

  // Calculate time until/since a band
  const getTimeStatus = (band) => {
    const testCurrentTime = effectiveNow;

    // Parse band start and end times with the date field
    const bandStart = new Date(`${band.date}T${band.startTime}:00`);
    const bandEnd = new Date(`${band.date}T${band.endTime}:00`);

    const diffToStart = bandStart - testCurrentTime;
    const diffToEnd = bandEnd - testCurrentTime;

    // Band is happening now
    if (diffToStart <= 0 && diffToEnd > 0) {
      const minutesLeft = Math.ceil(diffToEnd / 1000 / 60);
      return {
        status: "now",
        icon: "fa-solid fa-guitar",
        text: `Playing now - ${minutesLeft} min left`,
        color: "bg-green-500/20 border-green-500/50 text-green-200",
      };
    }

    // Band has finished
    if (diffToEnd <= 0) {
      return {
        status: "past",
        icon: "fa-solid fa-check",
        text: "Finished",
        color: "bg-gray-500/20 border-gray-500/50 text-gray-400",
      };
    }

    // Band is upcoming
    const minutesUntil = Math.ceil(diffToStart / 1000 / 60);
    if (minutesUntil <= 15) {
      return {
        status: "soon",
        icon: "fa-solid fa-bell",
        text: "Starting soon!",
        color: "bg-yellow-500/20 border-yellow-500/50 text-yellow-200",
      };
    } else if (minutesUntil <= 60) {
      return {
        status: "upcoming",
        icon: "fa-regular fa-clock",
        text: `In ${minutesUntil} min`,
        color: "bg-blue-500/20 border-blue-500/50 text-blue-200",
      };
    } else if (minutesUntil >= 1440) {
      const days = Math.floor(minutesUntil / 1440);
      const remainder = minutesUntil % 1440;
      const hours = Math.floor(remainder / 60);
      const mins = remainder % 60;
      const parts = [`${days}d`];
      if (hours > 0) parts.push(`${hours}h`);
      if (mins > 0) parts.push(`${mins}m`);
      return {
        status: "later",
        icon: "fa-solid fa-hourglass-half",
        text: `In ${parts.join(" ")}`,
        color: "bg-blue-500/20 border-blue-500/50 text-blue-200",
      };
    } else {
      const hours = Math.floor(minutesUntil / 60);
      const mins = minutesUntil % 60;
      const timeLabel = mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
      return {
        status: "later",
        icon: "fa-solid fa-hourglass-half",
        text: `In ${timeLabel}`,
        color: "bg-blue-500/20 border-blue-500/50 text-blue-200",
      };
    }
  };

  // Sort bands chronologically using date + time
  const sortedBands = [...bands].sort((a, b) => {
    const aTime = new Date(`${a.date}T${a.startTime}:00`);
    const bTime = new Date(`${b.date}T${b.startTime}:00`);
    return aTime - bTime;
  });

  const visibleBands = showPast
    ? sortedBands
    : sortedBands.filter((band) => {
        const bandEnd = new Date(`${band.date}T${band.endTime}:00`);
        return bandEnd > effectiveNow;
      });

  const hiddenFinishedCount = sortedBands.length - visibleBands.length;

  // Detect overlaps and conflicts
  const conflicts = [];
  const overlaps = [];

  for (let i = 0; i < visibleBands.length; i++) {
    const current = visibleBands[i];
    const currentStart = new Date(`${current.date}T${current.startTime}:00`);
    const currentEnd = new Date(`${current.date}T${current.endTime}:00`);

    // Check against all other bands for overlaps
    for (let j = i + 1; j < visibleBands.length; j++) {
      const other = visibleBands[j];
      const otherStart = new Date(`${other.date}T${other.startTime}:00`);
      const otherEnd = new Date(`${other.date}T${other.endTime}:00`);

      // Check if times overlap
      if (currentStart < otherEnd && otherStart < currentEnd) {
        // Complete overlap (same start time)
        if (currentStart.getTime() === otherStart.getTime()) {
          overlaps.push({ band1: current.id, band2: other.id });
        } else {
          // Partial conflict
          conflicts.push({ band1: current.id, band2: other.id });
        }
      }
    }
  }

  if (sortedBands.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-white text-xl mb-2">Your schedule is empty</p>
        <p className="text-band-orange">
          Tap on bands from "All Bands" to build your schedule
        </p>
      </div>
    );
  }

  if (!showPast && visibleBands.length === 0 && hiddenFinishedCount > 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-white text-xl mb-2">
          All your selected bands have wrapped up
        </p>
        <p className="text-band-orange">
          Tap &ldquo;Show finished sets&rdquo; to revisit what you already
          caught.
        </p>
        <div className="mt-4">
          <button
            onClick={onToggleShowPast}
            className="text-xs px-3 py-1.5 rounded bg-band-orange/20 border border-band-orange/50 text-band-orange hover:bg-band-orange/30 transition-colors"
          >
            Show finished sets
          </button>
        </div>
      </div>
    );
  }

  // Get bands with venue travel warnings (Room 47 is across the street from other venues)
  const travelWarnings = {};
  for (let i = 0; i < visibleBands.length - 1; i++) {
    const current = visibleBands[i];
    const next = visibleBands[i + 1];
    const currentIsRoom47 = current.venue === "Room 47";
    const nextIsRoom47 = next.venue === "Room 47";

    // Warn if crossing between Room 47 and other venues (either direction)
    // The warning shows on the band you're going TO
    if (currentIsRoom47 !== nextIsRoom47) {
      travelWarnings[next.id] = `${next.venue} is across the street`;
    }
  }

  // Get contextual reminders based on schedule and time
  const getScheduleReminder = () => {
    if (sortedBands.length === 0) return null;

    const now = new Date();
    const currentHour = now.getHours();

    // Find longest break in schedule
    let longestBreak = 0;
    for (let i = 0; i < visibleBands.length - 1; i++) {
      const current = visibleBands[i];
      const next = visibleBands[i + 1];
      const currentEnd = new Date(`${current.date}T${current.endTime}:00`);
      const nextStart = new Date(`${next.date}T${next.startTime}:00`);
      const breakMinutes = (nextStart - currentEnd) / 1000 / 60;
      longestBreak = Math.max(longestBreak, breakMinutes);
    }

    // Show different messages based on context
    if (longestBreak >= 60) {
      return {
        icon: "fa-solid fa-pizza-slice",
        text: "You've got some longer breaks - perfect time to grab food or hang with friends!",
      };
    } else if (currentHour >= 21 && currentHour < 22) {
      return {
        icon: "fa-solid fa-droplet",
        text: "Stay hydrated! Grab some water and maybe a snack",
      };
    } else if (currentHour >= 22 && currentHour < 23) {
      return {
        icon: "fa-solid fa-camera",
        text: "Don't forget to take some pictures and videos!",
      };
    } else if (currentHour >= 23 || currentHour < 1) {
      return {
        icon: "fa-solid fa-camera-retro",
        text: "Capture the memories - snap some selfies with your friends!",
      };
    } else if (currentHour >= 1 && currentHour < 3) {
      return {
        icon: "fa-solid fa-music",
        text: "Late night energy! Have fun and enjoy the music!",
      };
    } else if (visibleBands.length >= 5) {
      return {
        icon: "fa-solid fa-star",
        text: "Stacked lineup! Keep the fun rolling all night.",
      };
    }

    return null;
  };

  const reminder = getScheduleReminder();
  const hasFinishedBands = hiddenFinishedCount > 0;
  const [copyButtonLabel, setCopyButtonLabel] = useState("Copy Schedule");
  const [isCopyingSchedule, setIsCopyingSchedule] = useState(false);

  const formatRange = (start, end) => {
    const to12Hour = (time24) => {
      const [hours, minutes] = time24.split(":").map(Number);
      const period = hours >= 12 ? "PM" : "AM";
      const hours12 = hours % 12 || 12;
      return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
    };
    return `${to12Hour(start)} - ${to12Hour(end)}`;
  };

  const copyBands = async (bandsToCopy) => {
    if (bandsToCopy.length === 0) {
      return false;
    }

    const text = bandsToCopy
      .map(
        (band) =>
          `${band.name} — ${formatRange(band.startTime, band.endTime)} @ ${band.venue}`
      )
      .join("\n");

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      /* fallback below */
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      const selection = document.getSelection();
      const originalRange =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      textarea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (originalRange && selection) {
        selection.removeAllRanges();
        selection.addRange(originalRange);
      }
      return successful;
    } catch (_) {
      return false;
    }
  };

  let dreReminderPlaced = false;

  return (
    <div className="py-6 space-y-6 sm:space-y-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white text-center">
              My Schedule
            </h2>
            <p className="text-center text-band-orange text-sm">
              {showPast
                ? `${sortedBands.length} ${
                    sortedBands.length === 1 ? "band" : "bands"
                  } selected`
                : `${visibleBands.length} upcoming ${
                    visibleBands.length === 1 ? "band" : "bands"
                  }`}
              {!showPast && hiddenFinishedCount > 0 && (
                <span className="block text-xs text-band-orange/80">
                  ({hiddenFinishedCount} finished{" "}
                  {hiddenFinishedCount === 1 ? "set hidden" : "sets hidden"})
                </span>
              )}
            </p>
          </div>
        </div>
        {sortedBands.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-3 sm:gap-4 mt-3">
            {hasFinishedBands && (
              <button
                onClick={onToggleShowPast}
                className={`text-xs px-3 py-1.5 rounded border transition-transform duration-150 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-band-orange ${
                  showPast
                    ? "bg-band-orange/20 border-band-orange/50 text-band-orange hover:bg-band-orange/30"
                    : "bg-band-purple/50 border-band-orange/50 text-band-orange hover:bg-band-purple"
                }`}
                title={showPast ? "Hide finished sets" : "Show finished sets"}
              >
                {showPast ? "Hide finished sets" : "Show finished sets"}
              </button>
            )}
            <div className="flex justify-center gap-3 sm:gap-4">
              <button
                onClick={async () => {
                  if (isCopyingSchedule) return;
                  setIsCopyingSchedule(true);
                  const success = await copyBands(showPast ? sortedBands : visibleBands);
                  if (success) {
                    setCopyButtonLabel("Copied!");
                    setTimeout(() => {
                      setCopyButtonLabel("Copy Schedule");
                      setIsCopyingSchedule(false);
                    }, 2000);
                  } else {
                    setIsCopyingSchedule(false);
                  }
                }}
                className="text-xs px-3 py-1.5 rounded bg-band-purple/60 border border-band-purple/40 text-white flex items-center gap-2 transition-transform duration-150 hover:bg-band-purple/80 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-band-orange min-h-[44px]"
                title={copyButtonLabel === "Copied!" ? "Schedule copied to clipboard" : "Copy your schedule"}
                disabled={isCopyingSchedule}
              >
                <i
                  className={copyButtonLabel === "Copied!" ? "fa-solid fa-check" : "fa-regular fa-copy"}
                  aria-hidden="true"
                ></i>
                <span className="transition-opacity duration-200 ease-in-out">
                  {copyButtonLabel}
                </span>
              </button>
              <button
                onClick={onClearSchedule}
                className="text-xs px-3 py-1.5 rounded bg-red-500/20 border border-red-500/50 text-red-200 flex items-center gap-2 transition-transform duration-150 hover:bg-red-500/30 hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-300"
                title="Clear all selected bands"
              >
                <i className="fa-solid fa-trash-can" aria-hidden="true"></i>
                <span>Clear All</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Contextual reminder */}
      {reminder && (
        <div className="max-w-2xl mx-auto">
          <div className="text-xs text-green-300 bg-green-900/20 px-4 py-2 rounded border border-green-500/30 text-center flex items-center justify-center gap-2 leading-normal">
            <i className={`${reminder.icon}`} aria-hidden="true"></i>
            <span>{reminder.text}</span>
          </div>
        </div>
      )}

      {(conflicts.length > 0 || overlaps.length > 0) && (
        <div className="space-y-4 max-w-2xl mx-auto">
          {overlaps.length > 0 && (
            <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 leading-normal">
              <p className="text-yellow-200 font-semibold text-center leading-normal">
                <span className="inline-flex items-center gap-2 justify-center">
                  <span
                    className="text-yellow-300 text-xl align-middle"
                    role="img"
                    aria-label="Simultaneous sets"
                    title="Simultaneous sets"
                  >
                    <i className="fa-solid fa-bolt" aria-hidden="true"></i>
                  </span>
                  <span className="text-sm sm:text-base text-center">
                    <span className="block">
                      {overlaps.length} band{overlaps.length !== 1 ? "s" : ""} happening at the same time
                    </span>
                    <span className="block">You&apos;ll need to choose!</span>
                  </span>
                </span>
              </p>
            </div>
          )}
          {conflicts.length > 0 && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 leading-normal">
              <p className="text-red-200 font-semibold text-center leading-normal">
                <span className="inline-flex items-center gap-2 justify-center">
                  <span
                    className="text-red-300 text-xl align-middle"
                    role="img"
                    aria-label="Overlapping sets"
                    title="Overlapping sets"
                  >
                    <i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                  </span>
                  <span className="text-sm sm:text-base text-center">
                    <span className="block">
                      {conflicts.length} overlapping set{conflicts.length !== 1 ? "s" : ""}
                    </span>
                    <span className="block">
                      Some bands won&apos;t be possible to see fully.
                    </span>
                  </span>
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4 max-w-2xl mx-auto">
        {visibleBands.map((band, idx) => {
          const hasConflict = conflicts.some(
            (c) => c.band1 === band.id || c.band2 === band.id
          );
          const hasOverlap = overlaps.some(
            (c) => c.band1 === band.id || c.band2 === band.id
          );
          const travelWarning = travelWarnings[band.id];
          const showDreReminder =
            !dreReminderPlaced && highlightedBandIds.has(band.id);
          if (showDreReminder) {
            dreReminderPlaced = true;
          }

          // Calculate gap from previous band
          let timeGap = null;
          if (idx > 0) {
            const prevBand = visibleBands[idx - 1];
            const prevEndTime = new Date(
              `${prevBand.date}T${prevBand.endTime}:00`
            );
            const currentStartTime = new Date(
              `${band.date}T${band.startTime}:00`
            );
            const gapMs = currentStartTime - prevEndTime;
            const gapMinutes = Math.floor(gapMs / 1000 / 60);

            // Only show breaks 15+ minutes (venues are close, don't need tight warnings)
            if (gapMinutes >= 15) {
              if (gapMinutes >= 60) {
                const hours = Math.floor(gapMinutes / 60);
                const mins = gapMinutes % 60;
                timeGap = `${hours}h ${mins}m break`;
              } else {
                timeGap = `${gapMinutes} min break`;
              }
            }
          }

          return (
            <div key={band.id} className="relative mb-6">
              {/* Time gap indicator */}
              {timeGap && (
                <div className="text-center text-white/50 text-xs italic py-3">
                  {timeGap}
                </div>
              )}
              {showDreReminder && (
                <div className="text-center text-white/80 text-xs italic pb-2 flex items-center justify-center gap-2">
                  <i
                    className="fa-solid fa-face-laugh-beam text-yellow-300"
                    aria-hidden="true"
                  ></i>
                  <span>
                    If you spot Dre tonight (short guy with red glasses), say hi,
                    tell him a joke, or even maybe grab him a drink.
                  </span>
                </div>
              )}
              <div className="flex gap-3 items-start">
                {/* Conflict/Overlap emoji - aligned with center of band card */}
                {(hasConflict || hasOverlap) && (
                  <div className="flex-shrink-0 flex items-start justify-center pt-1">
                    <span
                      role="img"
                      aria-label={hasOverlap ? "Simultaneous sets indicator" : "Overlapping sets indicator"}
                      title={hasOverlap ? "Happening at the same time" : "Overlapping times"}
                      className={`${hasOverlap ? "text-yellow-300" : "text-red-300"} text-xl align-middle`}
                    >
                      <i
                        className={`fa-solid ${
                          hasOverlap ? "fa-bolt" : "fa-triangle-exclamation"
                        }`}
                        aria-hidden="true"
                      ></i>
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="space-y-2">
                    {/* Travel warning - appears ABOVE the band card */}
                    {travelWarning && (
                      <div className="text-xs text-blue-300 bg-blue-900/30 px-3 py-1.5 rounded border border-blue-500/30 flex items-center gap-2">
                        <span
                          role="img"
                          aria-label="Travel time alert"
                          title="Travel time alert"
                        >
                          <i
                            className="fa-solid fa-person-walking"
                            aria-hidden="true"
                          ></i>
                        </span>
                        <span>Heads up, the next show at {travelWarning}</span>
                      </div>
                    )}

                    <div
                      className={
                        getTimeStatus(band).status === "now"
                          ? "playing-now rounded-xl"
                          : ""
                      }
                    >
                      <BandCard
                        band={band}
                        isSelected={true}
                        onToggle={onToggleBand}
                        showVenue={true}
                      />
                    </div>

                    {/* Countdown timer - appears BELOW the band card */}
                    {(() => {
                      const timeStatus = getTimeStatus(band);
                      return (
                        <div
                          className={`text-xs font-semibold px-3 py-1.5 rounded border ${timeStatus.color} flex items-center gap-2 leading-normal`}
                        >
                          <i className={timeStatus.icon} aria-hidden="true"></i>
                          <span>{timeStatus.text}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="max-w-2xl mx-auto mt-8 text-center text-xs text-white/60">
        <i className="fa-solid fa-taxi mr-2" aria-hidden="true"></i>
        Home safe plan: grab a rideshare, call a friend, or line up a sober
        ride—no drinking and driving.
      </div>
    </div>
  );
}

export default MySchedule;
