const net = require('net');
const dns = require('dns');
const dnsPromises = dns.promises;

// ✅ FIX: Use public DNS servers (India ISPs strip MX records)
dns.setServers(['8.8.8.8', '1.1.1.1', '9.9.9.9']);

/**
 * Get MX records for a domain, sorted by priority
 * Fallback: if MX fails, check A record (domain exists = maybe mail-capable)
 */
async function getMxRecords(domain) {
  // Try MX records first
  try {
    const records = await dnsPromises.resolveMx(domain);
    if (records && records.length > 0) {
      return records
        .sort((a, b) => a.priority - b.priority)
        .map(r => r.exchange);
    }
  } catch (err) {
    // MX lookup failed — try alternate resolver
    try {
      const resolver = new dnsPromises.Resolver();
      resolver.setServers(['8.8.8.8', '1.1.1.1']);
      const records = await resolver.resolveMx(domain);
      if (records && records.length > 0) {
        return records
          .sort((a, b) => a.priority - b.priority)
          .map(r => r.exchange);
      }
    } catch (err2) {
      // Both failed — fall through to A record check
    }
  }

  // Fallback: check if domain has A record (exists but MX unknown)
  try {
    const aRecords = await dnsPromises.resolve4(domain);
    if (aRecords && aRecords.length > 0) {
      // Domain exists but no MX — treat as "no mail capability"
      // But signal it as a "soft" no, not a hard fail
      return { softFail: true, aRecords };
    }
  } catch (err) {
    // Domain doesn't exist at all
  }

  return [];
}

/**
 * Normalize MX result — handle both array and {softFail} object
 */
function normalizeMx(result) {
  if (Array.isArray(result)) return { mx: result, softFail: false };
  if (result && result.softFail) return { mx: [], softFail: true };
  return { mx: [], softFail: false };
}

/**
 * Connect to SMTP server and probe an email address
 * Returns: { status, code, message }
 *   status: 'valid' | 'invalid' | 'catch_all' | 'unknown' | 'error'
 */
async function smtpProbe(email, mxHost, options = {}) {
  const { timeout = 10000, fromEmail = 'verify@example.com' } = options;

  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    let step = 0;
    let resolved = false;
    let responseBuffer = '';

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch (e) {}
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ status: 'error', code: null, message: 'Timeout' });
    }, timeout);

    socket.setEncoding('utf8');

    socket.on('data', (data) => {
      responseBuffer += data;
      const lines = responseBuffer.split('\r\n').filter(Boolean);
      const lastLine = lines[lines.length - 1];

      if (!lastLine || !/^\d{3} /.test(lastLine)) return;

      const code = parseInt(lastLine.slice(0, 3), 10);
      responseBuffer = '';

      if (step === 0) {
        if (code === 220) {
          socket.write(`HELO verify.local\r\n`);
          step = 1;
        } else {
          finish({ status: 'error', code, message: 'Bad greeting' });
        }
      } else if (step === 1) {
        if (code === 250) {
          socket.write(`MAIL FROM:<${fromEmail}>\r\n`);
          step = 2;
        } else {
          finish({ status: 'error', code, message: 'HELO rejected' });
        }
      } else if (step === 2) {
        if (code === 250) {
          socket.write(`RCPT TO:<${email}>\r\n`);
          step = 3;
        } else {
          finish({ status: 'error', code, message: 'MAIL FROM rejected' });
        }
      } else if (step === 3) {
        if (code === 250 || code === 251) {
          finish({ status: 'valid', code, message: 'Mailbox exists' });
        } else if ([550, 551, 552, 553, 554].includes(code)) {
          finish({ status: 'invalid', code, message: 'Mailbox does not exist' });
        } else if ([450, 451, 452].includes(code)) {
          finish({ status: 'unknown', code, message: 'Temporary failure' });
        } else {
          finish({ status: 'unknown', code, message: `Unexpected code ${code}` });
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      finish({ status: 'error', code: null, message: err.message });
    });

    socket.on('close', () => {
      clearTimeout(timer);
      if (!resolved) {
        finish({ status: 'error', code: null, message: 'Connection closed' });
      }
    });
  });
}

module.exports = { getMxRecords, normalizeMx, smtpProbe };