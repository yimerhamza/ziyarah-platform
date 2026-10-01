const uid = p => p + Math.random().toString(36).slice(2, 10);

const DB = {
  state: null,
  loaded: false,

  async loadAll() {
    if (this.loaded) return this.state;

    const [org, members, units, accounts, entries, lines, loans, campaigns, sharings, notes, audits] =
      await Promise.all([
        supabaseClient.from('organizations').select('*').eq('id', 'default').maybeSingle(),
        supabaseClient.from('members').select('*').is('deleted_at', null),
        supabaseClient.from('units').select('*').is('deleted_at', null),
        supabaseClient.from('accounts').select('*'),
        supabaseClient.from('journal_entries').select('*').order('date', { ascending: true }),
        supabaseClient.from('journal_lines').select('*'),
        supabaseClient.from('loans').select('*').is('deleted_at', null),
        supabaseClient.from('campaigns').select('*').is('deleted_at', null),
        supabaseClient.from('shareholdings').select('*'),
        supabaseClient.from('notifications').select('*').order('created_at', { ascending: false }).limit(50),
        supabaseClient.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
      ]);

    const check = (res, name) => {
      if (res.error) throw new Error(`Failed to load ${name}: ${res.error.message}`);
      return res.data;
    };

    this.state = {
      org: org.data ? {
        name: org.data.name,
        currency: org.data.currency || 'ETB',
        symbol: org.data.symbol || 'Br',
        sharePrice: Number(org.data.share_price || 100),
        founded: org.data.founded,
      } : { name: CONFIG.brand.name, currency: 'ETB', symbol: 'Br', sharePrice: 100 },

      members: (check(members, 'members') || []).map(m => ({
        id: m.id, name: m.name, phone: m.phone, email: m.email,
        role: m.role, status: m.status,
        memberNumber: m.member_number, joinedAt: m.created_at,
      })),
      units: (check(units, 'units') || []).map(u => ({
        id: u.id, name: u.name, description: u.description,
        managerId: u.manager_id, category: u.category,
        initialCapital: Number(u.initial_capital),
        status: u.status, createdAt: u.created_at,
      })),
      accounts: (check(accounts, 'accounts') || []).map(a => ({
        id: a.id, code: a.code, name: a.name, type: a.type, normal: a.normal,
        balance: Number(a.balance), membershipId: a.membership_id,
        unitId: a.unit_id, isSystem: a.is_system,
      })),
      journalEntries: (check(entries, 'journal_entries') || []).map(e => ({
        id: e.id, date: e.date, description: e.description, type: e.type,
        reference: e.reference, metadata: e.metadata || {},
        reversedAt: e.reversed_at, createdById: e.created_by,
      })),
      journalLines: (check(lines, 'journal_lines') || []).map(l => ({
        id: l.id, journalEntryId: l.journal_entry_id, accountId: l.account_id,
        debit: Number(l.debit), credit: Number(l.credit), memo: l.memo,
      })),
      loans: (check(loans, 'loans') || []).map(l => ({
        id: l.id, loanNumber: l.loan_number, membershipId: l.membership_id,
        principal: Number(l.principal), interestRate: Number(l.interest_rate),
        termMonths: l.term_months, totalInterest: Number(l.total_interest),
        totalDue: Number(l.total_due), monthlyPayment: Number(l.monthly_payment),
        outstandingPrincipal: Number(l.outstanding_principal),
        outstandingInterest: Number(l.outstanding_interest),
        status: l.status, purpose: l.purpose,
        repayments: l.repayments || [], requestedAt: l.created_at,
      })),
      campaigns: (check(campaigns, 'campaigns') || []).map(c => ({
        id: c.id, name: c.name, description: c.description,
        targetAmount: Number(c.target_amount), raisedAmount: Number(c.raised_amount),
        status: c.status, createdAt: c.created_at,
      })),
      shareholdings: (check(sharings, 'shareholdings') || []).map(s => ({
        id: s.id, membershipId: s.membership_id,
        sharesOwned: s.shares_owned, totalInvested: Number(s.total_invested),
      })),
      notifications: (check(notes, 'notifications') || []).map(n => ({
        id: n.id, title: n.title, message: n.message, type: n.type,
        read: n.read, createdAt: n.created_at,
      })),
      auditLogs: (check(audits, 'audit_logs') || []).map(a => ({
        id: a.id, action: a.action, entityType: a.entity_type,
        entityId: a.entity_id, userId: a.user_id, createdAt: a.created_at,
      })),
    };

    this.loaded = true;
    return this.state;
  },

  async refresh() { this.loaded = false; return this.loadAll(); },

  async insert(table, row) {
    const { data, error } = await supabaseClient.from(table).insert(row).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
  async update(table, id, patch) {
    const { data, error } = await supabaseClient.from(table).update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },
};

const Ledger = {
  account(code) { return DB.state.accounts.find(a => a.code === code); },
  balance(code) {
    const a = this.account(code);
    return a ? Math.round(Number(a.balance) * 100) / 100 : 0;
  },
  totalByPrefix(p) {
    return DB.state.accounts.filter(a => a.code.startsWith(p))
      .reduce((s, a) => s + Number(a.balance), 0);
  },

  async post({ description, type, reference, lines, metadata }) {
    const dr = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(dr - cr) > 0.001)
      throw new Error(`Unbalanced (Dr ${dr} ≠ Cr ${cr})`);

    const entryId = uid('je_');
    await DB.insert('journal_entries', {
      id: entryId, date: new Date().toISOString(),
      description, type,
      reference: reference || null,
      metadata: metadata || {},
      created_by: 'system',
    });

    const lineRows = [];
    for (const l of lines) {
      if (!l.debit && !l.credit) continue;
      const acc = this.account(l.accountCode);
      if (!acc) throw new Error('Account not found: ' + l.accountCode);
      lineRows.push({
        id: uid('jl_'), journal_entry_id: entryId, account_id: acc.id,
        debit: Number(l.debit || 0), credit: Number(l.credit || 0),
        memo: l.memo || null,
      });
      const isDebitNormal = acc.normal === 'DEBIT';
      const delta = Number(l.debit || 0) - Number(l.credit || 0);
      const newBalance = Math.round((Number(acc.balance) + (isDebitNormal ? delta : -delta)) * 100) / 100;
      acc.balance = newBalance;
      await DB.update('accounts', acc.id, { balance: newBalance });
    }
    if (lineRows.length) {
      const { error } = await supabaseClient.from('journal_lines').insert(lineRows);
      if (error) throw new Error(error.message);
    }

    DB.state.journalEntries.push({
      id: entryId, date: new Date().toISOString(),
      description, type, reference, metadata: metadata || {}, reversedAt: null,
    });
    return entryId;
  },

  verify() {
    let dr = 0, cr = 0;
    for (const l of DB.state.journalLines) { dr += Number(l.debit); cr += Number(l.credit); }
    return { balanced: Math.abs(dr - cr) < 0.01, debit: dr, credit: cr };
  },
};

const MemberService = {
  list() { return DB.state.members.filter(m => !m.deletedAt); },

  async create({ name, phone, email, role, status }) {
    name = (name || '').trim();
    if (!name) throw new Error('Name is required');
    if (phone && DB.state.members.some(m => m.phone === phone))
      throw new Error('Phone already exists');

    const id = uid('m_');
    const memberNumber = 'ZDBG-' + String(DB.state.members.length + 1).padStart(4, '0');

    await DB.insert('members', {
      id, name,
      phone: phone || null, email: email || null,
      role: role || 'MEMBER', status: status || 'ACTIVE',
      member_number: memberNumber,
    });

    const accounts = [
      { id: uid('ac_'), code: `SAV-${id}`,  name: 'Member Savings',  type: 'LIABILITY', normal: 'CREDIT', balance: 0, membership_id: id },
      { id: uid('ac_'), code: `LOAN-${id}`, name: 'Loan Receivable', type: 'ASSET',     normal: 'DEBIT',  balance: 0, membership_id: id },
      { id: uid('ac_'), code: `SHR-${id}`,  name: 'Share Capital',   type: 'EQUITY',    normal: 'CREDIT', balance: 0, membership_id: id },
    ];
    const { error: accErr } = await supabaseClient.from('accounts').insert(accounts);
    if (accErr) throw new Error(accErr.message);

    await DB.insert('shareholdings', {
      id: uid('sh_'), membership_id: id, shares_owned: 0, total_invested: 0,
    });

    const member = { id, name, phone, email, role, status, memberNumber, joinedAt: new Date().toISOString() };
    DB.state.members.push(member);
    accounts.forEach(a => DB.state.accounts.push({
      id: a.id, code: a.code, name: a.name, type: a.type, normal: a.normal,
      balance: 0, membershipId: id, isSystem: false,
    }));
    DB.state.shareholdings.push({ id: uid('sh_'), membershipId: id, sharesOwned: 0, totalInvested: 0 });
    return member;
  },

  async update(id, patch) {
    const m = DB.state.members.find(x => x.id === id);
    if (!m) throw new Error('Member not found');
    await DB.update('members', id, {
      name: patch.name ?? m.name,
      phone: patch.phone ?? m.phone,
      email: patch.email ?? m.email,
      role: patch.role ?? m.role,
      status: patch.status ?? m.status,
    });
    Object.assign(m, patch);
    return m;
  },

  async remove(id) {
    await DB.update('members', id, {
      deleted_at: new Date().toISOString(), status: 'EXITED',
    });
    const m = DB.state.members.find(x => x.id === id);
    if (m) { m.deletedAt = new Date().toISOString(); m.status = 'EXITED'; }
  },
};

const SavingsService = {
  async deposit(memberId, amount, note) {
    amount = Math.round(Number(amount) * 100) / 100;
    if (amount <= 0) throw new Error('Amount must be > 0');
    const m = DB.state.members.find(x => x.id === memberId);
    if (!m) throw new Error('Member not found');

    await Ledger.post({
      description: `Savings deposit · ${m.name}`,
      type: 'SAVINGS_DEPOSIT',
      lines: [
        { accountCode: '1000', debit: amount },
        { accountCode: `SAV-${memberId}`, credit: amount, memo: note },
      ],
      metadata: { memberId, amount, note },
    });
  },

  async withdraw(memberId, amount) {
    amount = Math.round(Number(amount) * 100) / 100;
    const bal = Ledger.balance(`SAV-${memberId}`);
    if (bal < amount) throw new Error(`Insufficient (available ${bal})`);

    await Ledger.post({
      description: `Savings withdrawal · ${DB.state.members.find(m => m.id === memberId)?.name || '?'}`,
      type: 'SAVINGS_WITHDRAWAL',
      lines: [
        { accountCode: `SAV-${memberId}`, debit: amount },
        { accountCode: '1000', credit: amount },
      ],
      metadata: { memberId, amount },
    });
  },
};

window.ZIYARAH = { DB, Ledger, MemberService, SavingsService, CONFIG };