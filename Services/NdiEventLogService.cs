using System.Collections.Concurrent;
using NDIManager.Models;

namespace NDIManager.Services;

public class NdiEventLogService
{
    private const int MaxEntries = 300;
    private readonly ConcurrentQueue<NdiEventLogEntry> _entries = new();

    public void Add(string source, string endpointUuid, string eventName, string eventValue)
    {
        _entries.Enqueue(new NdiEventLogEntry
        {
            Timestamp = DateTime.UtcNow,
            Source = source,
            EndpointUuid = endpointUuid,
            EventName = eventName,
            EventValue = eventValue
        });

        while (_entries.Count > MaxEntries && _entries.TryDequeue(out _))
        {
        }
    }

    public List<NdiEventLogEntry> GetRecent(int limit = 100)
    {
        var list = _entries.ToList();
        if (limit <= 0 || list.Count <= limit)
            return list.OrderByDescending(e => e.Timestamp).ToList();

        return list.OrderByDescending(e => e.Timestamp).Take(limit).ToList();
    }
}
