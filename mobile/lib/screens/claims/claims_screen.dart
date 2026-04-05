import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'claim_file_screen.dart';

String _formatRupees(dynamic amount) {
  final numeric = amount is num ? amount : num.tryParse(amount?.toString() ?? '');
  return (numeric ?? 0).truncate().toString();
}

class ClaimsScreen extends StatefulWidget {
  const ClaimsScreen({super.key});
  @override
  State<ClaimsScreen> createState() => _ClaimsScreenState();
}

class _ClaimsScreenState extends State<ClaimsScreen> {
  List<dynamic> _claims = [];
  Map<String, dynamic>? _worker;
  bool _loading = true;

  @override
  void initState() { super.initState(); _fetch(); }

  Future<void> _fetch() async {
    try {
      final res = await Future.wait([
        ApiService.get('/claims'),
        ApiService.get('/workers/me'),
      ]);
      if (mounted) setState(() { _claims = res[0]['claims'] ?? []; _worker = res[1]; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Claims')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _fetch,
              child: _claims.isEmpty
                  ? Center(child: Text('No claims yet.', style: GoogleFonts.inter(color: AppTheme.textSecondary)))
                  : ListView.separated(
                      padding: const EdgeInsets.all(20),
                      itemCount: _claims.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (ctx, i) => _ClaimCard(claim: _claims[i]),
                    ),
            ),
      floatingActionButton: ((_worker?['total_deliveries'] ?? 0) >= 7)
          ? FloatingActionButton.extended(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ClaimFileScreen(onSuccess: _fetch))),
              backgroundColor: AppTheme.primary,
              icon: const Icon(Icons.add_rounded, color: Colors.white),
              label: Text('File Claim', style: GoogleFonts.inter(fontWeight: FontWeight.w600, color: Colors.white)),
            )
          : null,
    );
  }
}

class _ClaimCard extends StatelessWidget {
  final Map<String, dynamic> claim;
  const _ClaimCard({required this.claim});

  Color _statusColor(String status) {
    if (status == 'approved') return AppTheme.success;
    if (status == 'rejected') return AppTheme.error;
    return AppTheme.warning;
  }

  @override
  Widget build(BuildContext context) {
    final status = claim['status'] ?? '';
    final trigger = (claim['trigger_type'] ?? '').toString().replaceAll('_', ' ').toUpperCase();
    final payout = claim['payout_amount'];
    final cColor = _statusColor(status);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(16)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: cColor.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
            child: Text(status.replaceAll('_', ' ').toUpperCase(), style: GoogleFonts.inter(color: cColor, fontSize: 10, fontWeight: FontWeight.w600)),
          ),
          const Spacer(),
          Text(claim['created_at']?['_seconds'] != null ? DateTime.fromMillisecondsSinceEpoch(claim['created_at']['_seconds'] * 1000).toString().substring(0, 10) : 'Now', style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 12)),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Icon(Icons.flash_on_rounded, color: AppTheme.secondary, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text(trigger, style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 16))),
          if (payout != null && status != 'pending_verification') Text('₹${_formatRupees(payout)}', style: GoogleFonts.inter(color: AppTheme.success, fontWeight: FontWeight.w700, fontSize: 18)),
        ]),
        if (status == 'rejected' && claim['rejection_reason'] != null) ...[
          const SizedBox(height: 12),
          Container(
            width: double.infinity, padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppTheme.error.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
            child: Text(claim['rejection_reason'], style: GoogleFonts.inter(color: const Color(0xFFFCA5A5), fontSize: 12)),
          ),
        ]
      ]),
    );
  }
}
