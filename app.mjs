export function parseLog(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose a JSON run object or a ModLab verification bundle.');
  const pairs = ('recordedRun' in input || 'cleanZipRun' in input)
    ? [['recordedRun', 'Recorded engine run'], ['cleanZipRun', 'Clean ZIP install run']].filter(([key]) => input[key] !== undefined)
    : [[null, 'Your run']];
  if (!pairs.length) throw new Error('The bundle contains no run.');
  return pairs.map(([key, label]) => {
    const run = key === null ? input : input[key];
    if (!run || run.game !== 'Mindustry') throw new Error('This viewer expects a Mindustry lab log.');
    for (const field of ['shots', 'hits']) {
      if (!Array.isArray(run[field]) || run[field].length !== 2 || !run[field].every(x => Number.isSafeInteger(x) && x >= 0)) throw new Error(`${field} must contain two non-negative integer counts.`);
    }
    if (run.hits.some((x, i) => x > run.shots[i])) throw new Error('Hits exceed shots. Check the log before comparing results.');
    for (const field of ['simulationTicks', 'durationSeconds']) {
      if (typeof run[field] !== 'number' || !Number.isFinite(run[field]) || run[field] < 0) throw new Error(`${field} must be a finite, non-negative number.`);
    }
    if (typeof run.finished !== 'boolean') throw new Error('The log must say whether the run finished.');
    if ((run.simulationTicks > 0 || run.shots.some(x => x > 0)) && run.durationSeconds <= 0) throw new Error('The duration is inconsistent with the simulation ticks or shots.');
    if (Math.abs(run.simulationTicks / 60 - run.durationSeconds) > 0.1) throw new Error('Simulation ticks and seconds do not agree for this lab.');
    return { ...run, label, shots: [...run.shots], hits: [...run.hits] };
  });
}

export function resultCsv(run) {
  const rows = [['lane', 'shots', 'hits', 'hit_percent', 'simulation_seconds', 'simulation_ticks', 'finished']];
  ['baseline', 'homing'].forEach((lane, i) => rows.push([lane, run.shots[i], run.hits[i], run.shots[i] ? (run.hits[i] / run.shots[i] * 100).toFixed(2) : '', run.durationSeconds, run.simulationTicks, run.finished]));
  return rows.map(row => row.join(',')).join('\r\n') + '\r\n';
}

if (typeof document !== 'undefined') {
  const el = id => document.getElementById(id);
  let runs = [], operation = 0;
  const text = (id, value) => { el(id).textContent = value; };
  function clearError(message) {
    runs = [];
    el('result').hidden = true;
    el('csv').disabled = true;
    text('status', message);
    el('status').classList.add('error');
  }
  function render() {
    const run = runs[Number(el('run').value)];
    if (!run) return;
    ['baseline', 'homing'].forEach((lane, i) => {
      const percentage = run.shots[i] ? run.hits[i] / run.shots[i] * 100 : null;
      text(`${lane}-percent`, percentage === null ? 'N/A' : `${Math.round(percentage * 10) / 10}%`);
      text(`${lane}-counts`, `${run.hits[i]} ${run.hits[i] === 1 ? 'hit' : 'hits'} / ${run.shots[i]} ${run.shots[i] === 1 ? 'shot' : 'shots'}`);
      el(`${lane}-bar`).style.width = `${percentage ?? 0}%`;
    });
    text('badge', run.finished ? 'Finished' : 'Incomplete');
    text('duration', `${run.durationSeconds.toFixed(2)} simulation seconds`);
    text('ticks', `${Math.round(run.simulationTicks).toLocaleString('en-US')} ticks`);
    const build = typeof run.build === 'string' ? run.build.slice(0, 40) : 'unspecified';
    text('build', `Mindustry ${build}`);
    text('warning', `${run.finished ? '' : 'Incomplete run: do not treat these counts as a finished comparison. '}${run.observerDead === true ? 'The observer died during this run. ' : ''}Fixed targets and aim. This is a steering demonstration, not a normal-play benchmark.`);
    el('csv').disabled = false;
  }
  function load(input, label) {
    runs = parseLog(input);
    el('run').replaceChildren(...runs.map((run, i) => {
      const option = document.createElement('option');
      option.value = String(i); option.textContent = run.label; return option;
    }));
    el('status').classList.remove('error');
    text('status', `${label} · ${runs.length} run${runs.length === 1 ? '' : 's'} · read locally`);
    el('result').hidden = false;
    render();
  }
  async function sample() {
    const current = ++operation;
    try {
      const response = await fetch('./sample-data.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('The saved example could not be loaded. Try opening its JSON file.');
      const data = await response.json();
      if (current === operation) load(data, 'Saved ModLab example · reviewed 2026-10-09');
    } catch (error) { if (current === operation) clearError(error.message); }
  }
  el('file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    const current = ++operation;
    try {
      if (file.size > 1_000_000) throw new Error('Choose a JSON log under 1 MB.');
      const data = JSON.parse(await file.text());
      if (current === operation) load(data, `Your file: ${file.name}`);
    } catch (error) {
      if (current === operation) clearError(error instanceof SyntaxError ? 'This file is not valid JSON. Choose a lab log.' : error.message);
    } finally { event.target.value = ''; }
  });
  el('sample').addEventListener('click', sample);
  el('run').addEventListener('change', render);
  el('csv').addEventListener('click', () => {
    const run = runs[Number(el('run').value)];
    if (!run) return;
    const url = URL.createObjectURL(new Blob([resultCsv(run)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'modlab-run-result.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  sample();
}
