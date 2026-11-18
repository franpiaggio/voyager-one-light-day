#!/usr/bin/env python3
"""Reproduce the compact NASA/JPL Horizons dataset used by the Voyager demo.
Calls are sequential in accordance with JPL API usage guidance. No live requests
are made from the deployed site. Position is heliocentric J2000 ecliptic, AU;
velocity is AU/day; timestamps are UTC Unix milliseconds.
"""
import datetime as dt
import json
import pathlib
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'dist' / 'data'
CACHE = ROOT / '.cache' / 'horizons'
API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
START = '1977-09-05 13:59:00'
END = '2026-11-18 10:16:07'
BODIES = {'mercury': '199', 'venus': '299', 'earth': '399', 'mars': '499',
          'jupiter': '599', 'saturn': '699', 'uranus': '799', 'neptune': '899',
          'voyager': '-31'}
SPECIAL = ['1977-09-05 13:59:00', '1979-03-05 12:05:00', '1980-11-12 23:46:00',
           '1990-02-14 00:00:00', '2004-12-16 00:00:00', '2012-08-25 00:00:00',
           '2026-11-17 00:00:00', END]

def julian(utc):
    return dt.datetime.fromisoformat(utc).replace(tzinfo=dt.timezone.utc).timestamp() / 86400 + 2440587.5

def fetch(name, suffix, extra):
    path = CACHE / f'{name}-{suffix}.json'
    if path.exists():
        raw = json.loads(path.read_text())
    else:
        params = {'format': 'json', 'COMMAND': f"'{BODIES[name]}'", 'OBJ_DATA': "'NO'",
                  'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'VECTORS'", 'CENTER': "'500@10'",
                  'OUT_UNITS': "'AU-D'", 'REF_PLANE': "'ECLIPTIC'", 'REF_SYSTEM': "'J2000'",
                  'VEC_TABLE': "'2'", 'CSV_FORMAT': "'YES'", 'VEC_CORR': "'NONE'", 'TIME_TYPE': "'UT'"}
        params.update(extra)
        url = API + '?' + urllib.parse.urlencode(params)
        for attempt in range(3):
            try:
                request = urllib.request.Request(url, headers={'User-Agent': 'VoyagerEducationalVisualization/1.0'})
                raw = json.load(urllib.request.urlopen(request, timeout=90))
                if raw.get('error'):
                    raise ValueError(raw['error'])
                if '$$SOE' not in raw.get('result', ''):
                    raise ValueError(raw.get('result', '')[:2000])
                CACHE.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(raw))
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2)
    if raw.get('signature', {}).get('version') != '1.2':
        print('Notice: inspect changed API version', raw.get('signature'), flush=True)
    result = raw['result'].split('$$SOE', 1)[1].split('$$EOE', 1)[0]
    rows = []
    for line in result.strip().splitlines():
        col = line.strip().split(',')
        if len(col) >= 8:
            stamp = round((float(col[0]) - 2440587.5) * 86400000)
            rows.append([stamp] + [round(float(v), 10 if i < 3 else 12) for i, v in enumerate(col[2:8])])
    print(name, suffix, len(rows), flush=True)
    return rows

def span(start, stop, step):
    return {'START_TIME': repr(start), 'STOP_TIME': repr(stop), 'STEP_SIZE': repr(step)}

def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bodies = {}
    for name in BODIES:
        rows = fetch(name, 'regular', span(START, END, '10 d'))
        rows += fetch(name, 'events', {'TLIST': "'" + ' '.join(f'{julian(t):.12f}' for t in SPECIAL) + "'", 'TLIST_TYPE': "'JD'"})
        if name in ('voyager', 'earth'):
            rows += fetch(name, 'launch', span(START, '1977-09-08 00:00:00', '1 h'))
        if name in ('voyager', 'earth', 'jupiter'):
            rows += fetch(name, 'jupiter', span('1979-03-02 00:00:00', '1979-03-09 00:00:00', '1 h'))
        if name in ('voyager', 'earth', 'saturn'):
            rows += fetch(name, 'saturn', span('1980-11-09 00:00:00', '1980-11-16 00:00:00', '1 h'))
        unique = {r[0]: r for r in rows}
        bodies[name] = sorted(unique.values())
    metadata = {
        'source': 'NASA/JPL Horizons API', 'sourceURL': API,
        'documentationURL': 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
        'retrievedUTC': dt.datetime.now(dt.timezone.utc).isoformat(),
        'frame': 'Heliocentric ecliptic J2000', 'center': 'Sun (500@10)',
        'timeScale': 'UTC (Horizons UT after 1962)', 'positionUnits': 'AU', 'velocityUnits': 'AU/day',
        'sampleColumns': ['unixMilliseconds', 'x', 'y', 'z', 'vx', 'vy', 'vz'],
        'sampleIntervalDays': 10, 'encounterIntervalHours': 1,
        'startUTC': START + 'Z', 'endUTC': END + 'Z',
        'launchUTC': '1977-09-05T12:56:00Z',
        'voyagerCoverageNote': 'Horizons Voyager 1 coverage begins 1977-09-05 13:58:36.2005 UTC; first sample 13:59 UTC. Launch before this time must be treated as an illustrative view.',
        'interpolation': 'Cubic Hermite between positions using the supplied AU/day velocities; Earth distance from the simultaneous interpolated heliocentric vectors.',
        'AU_km': 149597870.7, 'speedOfLight_km_s': 299792.458,
        'geometricNote': 'Geometric coordinate separation, not a light-time-corrected radio tracking observation. Positions are reconstructed/predicted ephemerides, not live telemetry.',
        'targetIDs': BODIES,
        'milestone': {'timeUTC': '2026-11-18T10:16:07Z', 'distanceKm': 25902068371.2, 'sourceURL': 'https://science.nasa.gov/mission/voyager/voyager-1/voyager-1-what-is-a-light-day/'}
    }
    result = {'metadata': metadata, 'bodies': bodies}
    out = OUTPUT / 'ephemeris.json'
    out.write_text(json.dumps(result, separators=(',', ':')))
    (OUTPUT / 'data-readme.json').write_text(json.dumps(metadata, indent=2))
    print('WROTE', str(out), out.stat().st_size, 'bytes', flush=True)
    v = bodies['voyager'][-1]; e = bodies['earth'][-1]
    distance = sum((v[i]-e[i])**2 for i in (1,2,3))**.5 * metadata['AU_km']
    print('Last sample geometric Earth distance km:', distance, 'light hours:', distance / 299792.458 / 3600, flush=True)

if __name__ == '__main__':
    main()
