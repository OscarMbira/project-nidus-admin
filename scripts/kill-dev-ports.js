import { execSync } from 'child_process'

const DEV_PORTS = [
  5175, // shell
  5180, 5181, 5182, 5183, 5184, 5185, 5186, 5187, 5188, 5189, 5190, 5191, 5192, 5193, 5194, 5195, 5196, 5197, 5198,
]

function killPort(port) {
  if (process.platform !== 'win32') return

  try {
    const output = execSync(`netstat -ano | findstr ":${port} "`, { encoding: 'utf8' })
    const pids = new Set()

    for (const line of output.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue
      const parts = line.trim().split(/\s+/)
      const pid = parts.at(-1)
      if (pid && pid !== '0') pids.add(pid)
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
        console.log(`Freed port ${port} (PID ${pid})`)
      } catch {
        // process may already have exited
      }
    }
  } catch {
    // no listeners on this port
  }
}

for (const port of DEV_PORTS) {
  killPort(port)
}
