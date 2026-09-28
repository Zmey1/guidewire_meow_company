import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';

String _formatRupees(dynamic amount) {
  final numeric =
      amount is num ? amount : num.tryParse(amount?.toString() ?? '');
  return (numeric ?? 0).truncate().toString();
}

bool _isValidUpiId(String value) {
  final trimmed = value.trim();
  return RegExp(r'^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9._-]{2,64}$')
      .hasMatch(trimmed);
}

String _formatTxDate(dynamic createdAt) {
  if (createdAt is Map && createdAt['_seconds'] != null) {
    final dt =
        DateTime.fromMillisecondsSinceEpoch(createdAt['_seconds'] * 1000);
    final month = dt.month.toString().padLeft(2, '0');
    final day = dt.day.toString().padLeft(2, '0');
    return '${dt.year}-$month-$day';
  }
  return 'Now';
}

String _withdrawalStatusLabel(String status) {
  switch (status.toLowerCase()) {
    case 'initiated':
      return 'Initiated';
    case 'pending':
      return 'Pending';
    case 'queued':
      return 'Queued';
    case 'processing':
      return 'Processing';
    case 'processed':
      return 'Processed';
    case 'failed':
      return 'Failed';
    case 'reversed':
      return 'Reversed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status.isEmpty ? 'Pending' : status;
  }
}

Color _withdrawalStatusColor(String status) {
  switch (status.toLowerCase()) {
    case 'processed':
      return AppTheme.success;
    case 'failed':
    case 'reversed':
    case 'cancelled':
      return AppTheme.error;
    case 'queued':
    case 'pending':
    case 'processing':
    case 'initiated':
      return const Color(0xFFF59E0B);
    default:
      return AppTheme.textSecondary;
  }
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
  bool _providerReady = false;
  String _savedUpiId = '';
  bool _fetching = false;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  bool _hasPendingWithdrawal(List<dynamic> txs) {
    for (final item in txs) {
      if (item is! Map) continue;
      final tx = Map<String, dynamic>.from(item);
      final type = (tx['type'] ?? '').toString().toLowerCase();
      final status = (tx['status'] ?? '').toString().toLowerCase();
      if (type == 'withdrawal' &&
          ['initiated', 'pending', 'queued', 'processing'].contains(status)) {
        return true;
      }
    }
    return false;
  }

  void _syncPolling(List<dynamic> txs) {
    final shouldPoll = _hasPendingWithdrawal(txs);
    if (!shouldPoll) {
      _pollTimer?.cancel();
      _pollTimer = null;
      return;
    }

    if (_pollTimer != null) return;

    _pollTimer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (!mounted || _withdrawing) return;
      _fetch();
    });
  }

  Future<void> _fetch() async {
    if (_fetching) return;
    _fetching = true;

    try {
      final data = await ApiService.get('/wallet');
      final profile =
          Map<String, dynamic>.from(data['withdrawal_profile'] ?? {});
      final txs = List<dynamic>.from(data['transactions'] ?? []);
      if (mounted) {
        setState(() {
          _balance = data['balance'] ?? 0;
          _txs = txs;
          _savedUpiId = (profile['upi_id'] ?? '').toString();
          _providerReady = profile['ready'] == true;
          _loading = false;
        });
        _syncPolling(txs);
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    } finally {
      _fetching = false;
    }
  }

  Future<void> _openWithdrawDialog() async {
    final amountCtrl = TextEditingController();
    final upiCtrl = TextEditingController(text: _savedUpiId);

    final payload = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: Text(
          'Withdraw to UPI',
          style: GoogleFonts.inter(
              color: Colors.white, fontWeight: FontWeight.w600),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: amountCtrl,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              style: GoogleFonts.inter(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'Amount (INR)',
                hintText: 'Enter amount',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: upiCtrl,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              style: GoogleFonts.inter(color: Colors.white),
              decoration: const InputDecoration(
                labelText: 'UPI ID',
                hintText: 'name@bank',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final parsedAmount = num.tryParse(amountCtrl.text.trim());
              Navigator.pop(ctx, {
                'amount': parsedAmount,
                'upi_id': upiCtrl.text.trim(),
              });
            },
            child: const Text('Withdraw'),
          ),
        ],
      ),
    );

    amountCtrl.dispose();
    upiCtrl.dispose();

    final selectedAmount = payload?['amount'] as num?;
    final selectedUpiId = (payload?['upi_id'] ?? '').toString().trim();

    if (selectedAmount == null || selectedAmount <= 0) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid amount')),
      );
      return;
    }

    if (!_isValidUpiId(selectedUpiId)) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid UPI ID')),
      );
      return;
    }

    await _withdraw(selectedAmount, selectedUpiId);
  }

  Future<void> _withdraw(num amount, String upiId) async {
    setState(() => _withdrawing = true);
    final res = await ApiService.post('/wallet/withdraw', {
      'amount': amount,
      'upi_id': upiId,
    });
    if (!mounted) return;
    setState(() => _withdrawing = false);

    if (res['success'] == true) {
      setState(() => _savedUpiId = upiId);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            res['message']?.toString() ??
                (res['pending'] == true
                    ? 'Withdrawal initiated. Check the status in your wallet.'
                    : 'Withdrawal successful'),
          ),
        ),
      );
      await _fetch();
      return;
    }

    final errorMsg = res['error']?.toString() ?? 'Withdrawal failed';
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(errorMsg)),
    );
  }

  IconData _txIcon(Map<String, dynamic> tx) {
    final type = (tx['type'] ?? '').toString().toLowerCase();
    if (type == 'withdrawal') return Icons.call_made_rounded;
    final amount = (tx['amount'] as num?) ?? 0;
    return amount >= 0
        ? Icons.arrow_downward_rounded
        : Icons.arrow_upward_rounded;
  }

  Color _txIconColor(Map<String, dynamic> tx) {
    final type = (tx['type'] ?? '').toString().toLowerCase();
    if (type == 'withdrawal') {
      return _withdrawalStatusColor((tx['status'] ?? 'pending').toString());
    }
    final amount = (tx['amount'] as num?) ?? 0;
    return amount >= 0 ? AppTheme.success : AppTheme.error;
  }

  String _txAmountLabel(Map<String, dynamic> tx) {
    final type = (tx['type'] ?? '').toString().toLowerCase();
    if (type == 'withdrawal') {
      final requested = (tx['requested_amount'] as num?) ??
          ((tx['amount'] as num?)?.abs()) ??
          0;
      final status = (tx['status'] ?? '').toString().toLowerCase();
      if (status == 'failed' || status == 'reversed' || status == 'cancelled') {
        return '₹${_formatRupees(requested)}';
      }
      return '-₹${_formatRupees(requested)}';
    }

    final amount = (tx['amount'] as num?) ?? 0;
    return '${amount >= 0 ? '+' : ''}₹${_formatRupees(amount)}';
  }

  Color _txAmountColor(Map<String, dynamic> tx) {
    final type = (tx['type'] ?? '').toString().toLowerCase();
    if (type == 'withdrawal') {
      final status = (tx['status'] ?? '').toString().toLowerCase();
      if (status == 'processed') return Colors.white;
      return _withdrawalStatusColor(status);
    }

    final amount = (tx['amount'] as num?) ?? 0;
    return amount >= 0 ? AppTheme.success : Colors.white;
  }

  String _txDescription(Map<String, dynamic> tx) {
    final explicit = (tx['description'] ?? '').toString().trim();
    if (explicit.isNotEmpty) return explicit;
    return 'Transaction';
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Wallet')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _fetch,
              child: CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Container(
                        padding: const EdgeInsets.all(32),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(24),
                          boxShadow: [
                            BoxShadow(
                              color: const Color(0xFF6366F1)
                                  .withValues(alpha: 0.3),
                              blurRadius: 20,
                              offset: const Offset(0, 10),
                            ),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Available Balance',
                              style: GoogleFonts.inter(
                                color: Colors.white.withValues(alpha: 0.8),
                                fontSize: 14,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '₹${_formatRupees(_balance)}',
                              style: GoogleFonts.inter(
                                color: Colors.white,
                                fontSize: 40,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              _providerReady
                                  ? (_savedUpiId.isEmpty
                                      ? 'Enter your UPI ID when you withdraw.'
                                      : 'Current UPI ID: $_savedUpiId')
                                  : 'RazorpayX backend setup is required before withdrawals can be processed.',
                              style: GoogleFonts.inter(
                                color: Colors.white.withValues(alpha: 0.84),
                                fontSize: 13,
                                height: 1.35,
                              ),
                            ),
                            const SizedBox(height: 20),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton.icon(
                                onPressed: (_withdrawing || !_providerReady)
                                    ? null
                                    : _openWithdrawDialog,
                                style: FilledButton.styleFrom(
                                  backgroundColor: Colors.white,
                                  foregroundColor: const Color(0xFF4338CA),
                                ),
                                icon: _withdrawing
                                    ? const SizedBox(
                                        width: 14,
                                        height: 14,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2),
                                      )
                                    : const Icon(Icons.call_made_rounded,
                                        size: 18),
                                label: Text(
                                  _withdrawing
                                      ? 'Submitting...'
                                      : 'Withdraw to UPI',
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    sliver: SliverToBoxAdapter(
                      child: Text(
                        'Transactions',
                        style: GoogleFonts.inter(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                  if (_txs.isEmpty)
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          'No transactions yet.',
                          style:
                              GoogleFonts.inter(color: AppTheme.textSecondary),
                        ),
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
                      sliver: SliverList(
                        delegate: SliverChildBuilderDelegate((ctx, i) {
                          final tx = Map<String, dynamic>.from(_txs[i] as Map);
                          final type =
                              (tx['type'] ?? '').toString().toLowerCase();
                          final withdrawalStatus = type == 'withdrawal'
                              ? (tx['status'] ?? 'pending').toString()
                              : '';
                          final badgeColor =
                              _withdrawalStatusColor(withdrawalStatus);

                          return Container(
                            margin: const EdgeInsets.only(bottom: 12),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: AppTheme.surface,
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 40,
                                  height: 40,
                                  decoration: BoxDecoration(
                                    color: _txIconColor(tx)
                                        .withValues(alpha: 0.15),
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(
                                    _txIcon(tx),
                                    color: _txIconColor(tx),
                                    size: 20,
                                  ),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        _txDescription(tx),
                                        style: GoogleFonts.inter(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Wrap(
                                        spacing: 8,
                                        runSpacing: 6,
                                        crossAxisAlignment:
                                            WrapCrossAlignment.center,
                                        children: [
                                          Text(
                                            _formatTxDate(tx['created_at']),
                                            style: GoogleFonts.inter(
                                              color: AppTheme.textSecondary,
                                              fontSize: 12,
                                            ),
                                          ),
                                          if (type == 'withdrawal')
                                            Container(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                horizontal: 8,
                                                vertical: 4,
                                              ),
                                              decoration: BoxDecoration(
                                                color: badgeColor.withValues(
                                                    alpha: 0.16),
                                                borderRadius:
                                                    BorderRadius.circular(999),
                                              ),
                                              child: Text(
                                                _withdrawalStatusLabel(
                                                    withdrawalStatus),
                                                style: GoogleFonts.inter(
                                                  color: badgeColor,
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w600,
                                                ),
                                              ),
                                            ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Text(
                                  _txAmountLabel(tx),
                                  textAlign: TextAlign.right,
                                  style: GoogleFonts.inter(
                                    color: _txAmountColor(tx),
                                    fontWeight: FontWeight.w600,
                                    fontSize: 16,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }, childCount: _txs.length),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}
