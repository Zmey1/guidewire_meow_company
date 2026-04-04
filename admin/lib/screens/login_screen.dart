import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/auth_service.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailCtrl = TextEditingController(text: 'admin@shiftsure.in');
  final _passCtrl = TextEditingController(text: 'Admin@123');
  bool _loading = false;
  String? _error;

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      await AuthService.signIn(_emailCtrl.text.trim(), _passCtrl.text.trim());
    } catch (e) {
      setState(() { _error = 'Invalid credentials. Try admin@shiftsure.in'; });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Center(
        child: Container(
          width: 420,
          padding: const EdgeInsets.all(48),
          decoration: BoxDecoration(
            color: const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(24),
            boxShadow: [BoxShadow(color: Colors.black45, blurRadius: 40, offset: const Offset(0, 20))],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)]),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.shield_rounded, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                Text('ShiftSure', style: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w700, color: Colors.white)),
              ]),
              const SizedBox(height: 8),
              Text('Admin Dashboard', style: GoogleFonts.inter(fontSize: 14, color: const Color(0xFF94A3B8))),
              const SizedBox(height: 40),
              Text('Email', style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500, color: const Color(0xFF94A3B8))),
              const SizedBox(height: 8),
              TextField(
                controller: _emailCtrl,
                style: GoogleFonts.inter(color: Colors.white),
                decoration: InputDecoration(
                  filled: true, fillColor: const Color(0xFF0F172A),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                ),
              ),
              const SizedBox(height: 16),
              Text('Password', style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500, color: const Color(0xFF94A3B8))),
              const SizedBox(height: 8),
              TextField(
                controller: _passCtrl,
                obscureText: true,
                style: GoogleFonts.inter(color: Colors.white),
                onSubmitted: (_) => _login(),
                decoration: InputDecoration(
                  filled: true, fillColor: const Color(0xFF0F172A),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0xFF7F1D1D), borderRadius: BorderRadius.circular(8)),
                  child: Text(_error!, style: GoogleFonts.inter(color: const Color(0xFFFCA5A5), fontSize: 13)),
                ),
              ],
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _loading ? null : _login,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF6366F1),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _loading
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Text('Sign in', style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 15)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
