import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';

String _formatRupees(dynamic amount) {
  final numeric = amount is num ? amount : num.tryParse(amount?.toString() ?? '');
  return (numeric ?? 0).truncate().toString();
}

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});
  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  num _balance = 0;
  List<dynamic> _txs = [];
  bool _loading = true;
  bool _withdrawing = false;

  @override
  void initState() { super.initState(); _fetch(); }

  Future<void> _fetch() async {
    try {
      final data = await ApiService.get('/wallet');
      if (mounted) setState(() { _balance = data['balance'] ?? 0; _txs = data['transactions'] ?? []; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _openWithdrawDialog() async {
    final amountCtrl = TextEditingController();
    final selectedAmount = await showDialog<num>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: Text('Withdraw Funds', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w600)),
        content: TextField(
          controller: amountCtrl,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          style: GoogleFonts.inter(color: Colors.white),
          decoration: const InputDecoration(
            labelText: 'Amount (INR)',
            hintText: 'Enter amount',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final parsed = num.tryParse(amountCtrl.text.trim());
              Navigator.pop(ctx, parsed);
            },
            child: const Text('Withdraw'),
          ),
        ],
      ),
    );

    if (selectedAmount == null || selectedAmount <= 0) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid amount')),
      );
      return;
    }

    await _withdraw(selectedAmount);
  }

  Future<void> _withdraw(num amount) async {
    setState(() => _withdrawing = true);
    final res = await ApiService.post('/wallet/withdraw', {'amount': amount});
    if (!mounted) return;
    setState(() => _withdrawing = false);

    if (res['success'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Withdrawal successful: ₹${_formatRupees(res['amount_withdrawn'])}')),
      );
      await _fetch();
      return;
    }

    final errorMsg = res['error']?.toString() ?? 'Withdrawal failed';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorMsg)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Wallet')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _fetch,
              child: CustomScrollView(slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Container(
                      padding: const EdgeInsets.all(32),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [BoxShadow(color: const Color(0xFF6366F1).withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, 10))],
                      ),
                      child: Column(children: [
                        Text('Available Balance', style: GoogleFonts.inter(color: Colors.white.withValues(alpha: 0.8), fontSize: 14)),
                        const SizedBox(height: 8),
                        Text('₹${_formatRupees(_balance)}', style: GoogleFonts.inter(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 20),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            onPressed: _withdrawing ? null : _openWithdrawDialog,
                            style: FilledButton.styleFrom(
                              backgroundColor: Colors.white,
                              foregroundColor: const Color(0xFF4338CA),
                            ),
                            icon: _withdrawing
                                ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Icon(Icons.call_made_rounded, size: 18),
                            label: Text(_withdrawing ? 'Processing...' : 'Withdraw'),
                          ),
                        ),
                      ]),
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  sliver: SliverToBoxAdapter(child: Text('Transactions', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white))),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
                  sliver: SliverList(delegate: SliverChildBuilderDelegate((ctx, i) {
                    final t = _txs[i];
                    final amt = (t['amount'] as num?) ?? 0;
                    final isPos = amt >= 0;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(16)),
                      child: Row(children: [
                        Container(
                          width: 40, height: 40,
                          decoration: BoxDecoration(color: (isPos ? AppTheme.success : AppTheme.error).withValues(alpha: 0.15), shape: BoxShape.circle),
                          child: Icon(isPos ? Icons.arrow_downward_rounded : Icons.arrow_upward_rounded, color: isPos ? AppTheme.success : AppTheme.error, size: 20),
                        ),
                        const SizedBox(width: 16),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(t['description'] ?? 'Transaction', style: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w500)),
                          Text(t['created_at']?['_seconds'] != null ? DateTime.fromMillisecondsSinceEpoch(t['created_at']['_seconds'] * 1000).toString().substring(0, 10) : 'Now', style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 12)),
                        ])),
                        Text('${isPos ? '+' : ''}₹${_formatRupees(amt)}', style: GoogleFonts.inter(color: isPos ? AppTheme.success : Colors.white, fontWeight: FontWeight.w600, fontSize: 16)),
                      ]),
                    );
                  }, childCount: _txs.length)),
                )
              ]),
            ),
    );
  }
}
