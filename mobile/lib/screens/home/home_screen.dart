import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../policy/policy_screen.dart';
import '../claims/claims_screen.dart';
import '../wallet/wallet_screen.dart';
import '../main_tabs.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? _worker, _policy, _wallet, _zoneRisk;
  List<dynamic> _recentClaims = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiService.get('/workers/me'),
        ApiService.get('/policies/current'),
        ApiService.get('/wallet'),
        ApiService.get('/zones/risk'),
        ApiService.get('/claims'),
      ]);
      if (mounted) setState(() {
        _worker = results[0];
        _policy = results[1]['policy'];
        _wallet = results[2];
        _zoneRisk = results[3];
        _recentClaims = (results[4]['claims'] as List).take(3).toList();
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: CustomScrollView(slivers: [
                SliverAppBar(
                  expandedHeight: 100, floating: true,
                  backgroundColor: AppTheme.background,
                  flexibleSpace: FlexibleSpaceBar(
                    titlePadding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
                    title: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Hi, ${_worker?['name']?.split(' ').first ?? 'Rider'} 👋', style: GoogleFonts.inter(fontSize: 20, fontWeight: FontWeight.w700, color: Colors.white)),
                      Text(_worker?['dark_store']?['name'] ?? '', style: GoogleFonts.inter(fontSize: 12, color: AppTheme.textSecondary)),
                    ]),
                  ),
                  actions: [
                    IconButton(icon: const Icon(Icons.logout_rounded, color: AppTheme.textSecondary),
                      onPressed: () => FirebaseAuth.instance.signOut()),
                  ],
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
                  sliver: SliverList(delegate: SliverChildListDelegate([
                    if ((_worker?['total_deliveries'] ?? 10) < 7) ...[
                      _DeliveryProgressCard(deliveries: _worker?['total_deliveries'] ?? 0),
                      const SizedBox(height: 16),
                    ],
                    _PolicyCard(policy: _policy, worker: _worker),
                    const SizedBox(height: 16),
                    _ZoneRiskCard(risk: _zoneRisk),
                    const SizedBox(height: 16),
                    _WalletCard(balance: _wallet?['balance'] ?? 0),
                    const SizedBox(height: 20),
                    if (_recentClaims.isNotEmpty) ...[
                      Text('Recent Activity', style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white)),
                      const SizedBox(height: 12),
                      ..._recentClaims.map((c) => _ClaimItem(claim: c)),
                    ],
                  ])),
                ),
              ]),
            ),
    );
  }
}

// ── Policy Card ──────────────────────────────────────────────────────────────

class _PolicyCard extends StatelessWidget {
  final Map<String, dynamic>? policy;
  final Map<String, dynamic>? worker;
  const _PolicyCard({this.policy, this.worker});

  @override
  Widget build(BuildContext context) {
    if (policy == null) {
      return _card(
        child: Column(children: [
          const Icon(Icons.shield_outlined, color: AppTheme.textSecondary, size: 40),
          const SizedBox(height: 12),
          Text('No active plan', style: GoogleFonts.inter(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text('Get covered to start filing claims', style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 13)),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => _switchToPolicy(context),
              child: const Padding(
                padding: EdgeInsets.symmetric(vertical: 12), 
                child: Text('Get Covered', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              ),
            ),
          ),
        ]),
      );
    }

    final plan = 'COVERED';
    final workerTier = (worker?['worker_tier'] as String? ?? 'REGULAR').toUpperCase().replaceAll('_', ' ');
    final cap = policy!['effective_weekly_cap'] ?? policy!['weekly_cap'] ?? 0;
    final used = policy!['payouts_issued_this_week'] ?? 0;
    final remaining = (cap - used).clamp(0, cap);
    final weekEnd = policy!['week_end'];
    final expiry = weekEnd is Map ? 'This week' : weekEnd?.toString() ?? '';

    return _card(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: AppTheme.primary.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(20)),
          child: Text('ACTIVE', style: GoogleFonts.inter(color: AppTheme.primary, fontSize: 11, fontWeight: FontWeight.w600)),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: AppTheme.secondary.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(20)),
          child: Text(workerTier, style: GoogleFonts.inter(color: AppTheme.secondary, fontSize: 11, fontWeight: FontWeight.w600)),
        ),
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(8)),
          child: Text(plan, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700)),
        ),
      ]),
      const SizedBox(height: 16),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        _stat('Weekly Cap', '₹$cap'),
        _stat('Used', '₹$used'),
        _stat('Remaining', '₹$remaining'),
      ]),
      const SizedBox(height: 12),
      ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(
        value: cap > 0 ? used / cap : 0,
        backgroundColor: AppTheme.surfaceVariant, color: AppTheme.secondary, minHeight: 6,
      )),
    ]));
  }

  Widget _stat(String l, String v) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(l, style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 11)),
    Text(v, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)),
  ]);

  void _switchToPolicy(BuildContext ctx) {
    Navigator.push(ctx, MaterialPageRoute(builder: (_) => const PolicyScreen()));
  }
}

// ── Zone Risk Card ─────────────────────────────────────────────────────────

class _ZoneRiskCard extends StatelessWidget {
  final Map<String, dynamic>? risk;
  const _ZoneRiskCard({this.risk});

  Color _tierColor(String? tier) {
    switch (tier) {
      case 'full': return AppTheme.error;
      case 'tier2': return const Color(0xFFF97316);
      case 'tier1': return AppTheme.warning;
      default: return AppTheme.success;
    }
  }

  @override
  Widget build(BuildContext context) {
    final score = (risk?['risk_score'] as num?)?.toDouble() ?? 0;
    final tier = risk?['tier'] as String? ?? 'none';
    final signals = risk?['signals'] as Map<String, dynamic>? ?? {};
    final color = _tierColor(tier);

    return _card(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text('Zone Risk', style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 13, fontWeight: FontWeight.w500)),
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
          child: Text(tier.toUpperCase(), style: GoogleFonts.inter(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
        ),
      ]),
      const SizedBox(height: 12),
      Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Text('${score.toStringAsFixed(0)}', style: GoogleFonts.inter(fontSize: 40, fontWeight: FontWeight.w700, color: Colors.white)),
        Padding(padding: const EdgeInsets.only(bottom: 6, left: 4), child: Text('/100', style: GoogleFonts.inter(color: AppTheme.textSecondary))),
      ]),
      const SizedBox(height: 8),
      ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(
        value: score / 100, backgroundColor: AppTheme.surfaceVariant, color: color, minHeight: 8,
      )),
      const SizedBox(height: 12),
      Wrap(spacing: 8, children: [
        if (signals['rainfall_mm'] != null && signals['rainfall_mm'] > 0) _chip('🌧 ${signals['rainfall_mm']}mm'),
        if (signals['flood_signal'] == true) _chip('🌊 Flood'),
        if (signals['dispatch_outage'] == true) _chip('🏪 Outage'),
        if (signals['zone_restriction'] == true) _chip('🚧 Restricted'),
        if (signals['unsafe_signal'] == true) _chip('⚠️ Unsafe'),
      ]),
    ]));
  }

  Widget _chip(String l) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: AppTheme.warning.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
    child: Text(l, style: GoogleFonts.inter(color: AppTheme.warning, fontSize: 12)),
  );
}

// ── Wallet Card ─────────────────────────────────────────────────────────────

class _WalletCard extends StatelessWidget {
  final num balance;
  const _WalletCard({required this.balance});

  @override
  Widget build(BuildContext context) {
    return _card(child: Row(children: [
      Container(
        width: 44, height: 44,
        decoration: BoxDecoration(color: AppTheme.success.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
        child: const Icon(Icons.account_balance_wallet_rounded, color: AppTheme.success, size: 22),
      ),
      const SizedBox(width: 16),
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Wallet Balance', style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 13)),
        Text('₹$balance', style: GoogleFonts.inter(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700)),
      ]),
    ]));
  }
}

// ── Claim Item ─────────────────────────────────────────────────────────────

class _ClaimItem extends StatelessWidget {
  final Map<String, dynamic> claim;
  const _ClaimItem({required this.claim});

  @override
  Widget build(BuildContext context) {
    final status = claim['status'] as String? ?? '';
    final color = status == 'approved' ? AppTheme.success : status == 'rejected' ? AppTheme.error : AppTheme.warning;
    final icon = status == 'approved' ? '🟢' : status == 'rejected' ? '🔴' : '🟡';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(14)),
      child: Row(children: [
        Text(icon, style: const TextStyle(fontSize: 18)),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(claim['trigger_type']?.toString().replaceAll('_', ' ').toUpperCase() ?? '', style: GoogleFonts.inter(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
          Text(status, style: GoogleFonts.inter(color: color, fontSize: 12)),
        ])),
        Text(claim['payout_amount'] != null && status != 'pending_verification' ? '₹${claim['payout_amount']}' : '...', style: GoogleFonts.inter(color: AppTheme.success, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

class _DeliveryProgressCard extends StatelessWidget {
  final int deliveries;
  const _DeliveryProgressCard({required this.deliveries});
  @override
  Widget build(BuildContext context) {
    return _card(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.delivery_dining_rounded, color: AppTheme.warning),
          const SizedBox(width: 8),
          Text('Eligibility', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
        ]),
        const SizedBox(height: 12),
        Text('Complete 7 deliveries to unlock coverage.', style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 13)),
        const SizedBox(height: 12),
        ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(
          value: deliveries / 7.0, backgroundColor: AppTheme.surfaceVariant, color: AppTheme.warning, minHeight: 6,
        )),
        const SizedBox(height: 8),
        Text('$deliveries / 7 Deliveries', style: GoogleFonts.inter(color: AppTheme.warning, fontSize: 12, fontWeight: FontWeight.w600)),
    ]));
  }
}

// ── Shared card wrapper ───────────────────────────────────────────────────

Widget _card({required Widget child}) => Container(
  width: double.infinity,
  padding: const EdgeInsets.all(20),
  decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(20)),
  child: child,
);
