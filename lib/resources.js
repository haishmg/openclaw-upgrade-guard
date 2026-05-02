import fs from "node:fs";
import os from "node:os";

const PAGE_SIZE = 4096;

export function startResourceMonitor(intervalMs = 2000) {
  const samples = [];
  const sample = () => {
    samples.push(collectResourceSample());
  };
  sample();
  const timer = setInterval(sample, intervalMs);
  return {
    stop() {
      clearInterval(timer);
      sample();
      return summarizeResourceSamples(samples);
    },
  };
}

function collectResourceSample() {
  const memory = readMemory();
  return {
    ts: new Date().toISOString(),
    loadavg: os.loadavg(),
    cpuCount: os.cpus().length,
    memory,
    processes: readInterestingProcesses(),
  };
}

function readMemory() {
  const meminfo = readMeminfo();
  const totalBytes = meminfo.MemTotal || os.totalmem();
  const availableBytes = meminfo.MemAvailable || os.freemem();
  const freeBytes = meminfo.MemFree || os.freemem();
  return {
    totalBytes,
    availableBytes,
    freeBytes,
    usedBytes: Math.max(0, totalBytes - availableBytes),
    availablePercent: totalBytes > 0 ? Math.round((availableBytes / totalBytes) * 1000) / 10 : null,
  };
}

function readMeminfo() {
  try {
    const out = {};
    for (const line of fs.readFileSync("/proc/meminfo", "utf8").split("\n")) {
      const match = line.match(/^([^:]+):\s+(\d+)\s+kB/);
      if (match) out[match[1]] = Number(match[2]) * 1024;
    }
    return out;
  } catch {
    return {};
  }
}

function readInterestingProcesses() {
  let entries;
  try {
    entries = fs.readdirSync("/proc", { withFileTypes: true });
  } catch {
    return [];
  }

  const processes = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const pid = Number(entry.name);
    const proc = readProcess(pid);
    if (!proc) continue;
    const haystack = `${proc.comm} ${proc.cmdline}`.toLowerCase();
    if (!/(openclaw|node)/.test(haystack)) continue;
    processes.push(proc);
  }

  return processes.sort((a, b) => b.rssBytes - a.rssBytes).slice(0, 20);
}

function readProcess(pid) {
  try {
    const comm = fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim();
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ").trim();
    const statm = fs.readFileSync(`/proc/${pid}/statm`, "utf8").trim().split(/\s+/).map(Number);
    return {
      pid,
      comm,
      cmdline: cmdline || comm,
      rssBytes: (statm[1] || 0) * PAGE_SIZE,
      sizeBytes: (statm[0] || 0) * PAGE_SIZE,
    };
  } catch {
    return null;
  }
}

function summarizeResourceSamples(samples) {
  const peak = {
    load1: 0,
    load1PerCpu: 0,
    memoryUsedPercent: 0,
    minMemoryAvailablePercent: 100,
    processRssBytes: 0,
    process: null,
  };

  for (const sample of samples) {
    const load1 = sample.loadavg?.[0] || 0;
    const load1PerCpu = sample.cpuCount ? load1 / sample.cpuCount : 0;
    const available = sample.memory?.availablePercent ?? 100;
    const usedPercent = 100 - available;
    if (load1 > peak.load1) peak.load1 = round(load1);
    if (load1PerCpu > peak.load1PerCpu) peak.load1PerCpu = round(load1PerCpu);
    if (usedPercent > peak.memoryUsedPercent) peak.memoryUsedPercent = round(usedPercent);
    if (available < peak.minMemoryAvailablePercent) peak.minMemoryAvailablePercent = round(available);
    for (const proc of sample.processes || []) {
      if (proc.rssBytes > peak.processRssBytes) {
        peak.processRssBytes = proc.rssBytes;
        peak.process = proc;
      }
    }
  }

  return {
    sampleCount: samples.length,
    startedAt: samples[0]?.ts || null,
    finishedAt: samples.at(-1)?.ts || null,
    peak,
    latest: samples.at(-1) || null,
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
