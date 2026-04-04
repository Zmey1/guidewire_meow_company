import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../main_tabs.dart';
import 'register_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phoneCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    try {
      final phone = _phoneCtrl.text.trim();
      if (phone.length != 10) {
        setState(() {
          _error = 'Please enter a valid 10-digit phone number';
          _loading = false;
        });
        return;
      }
      final email = '$phone@shiftsure.in';
      await FirebaseAuth.instance.signInWithEmailAndPassword(email: email, password: _passCtrl.text.trim());
      // main.dart handles it via authStateChanges stream
    } on FirebaseAuthException catch (e) {
      setState(() { _error = e.code == 'wrong-password' || e.code == 'user-not-found' ? 'Invalid phone or password' : e.message; });
    } catch (e) {
      setState(() { _error = 'Login failed: $e'; });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const SizedBox(height: 48),
              Container(
                width: 72, height: 72,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [BoxShadow(color: const Color(0xFF6366F1).withValues(alpha: 0.4), blurRadius: 20, offset: const Offset(0, 8))],
                ),
                child: const Icon(Icons.shield_rounded, color: Colors.white, size: 36),
              ),
              const SizedBox(height: 16),
              Text('ShiftSure', style: GoogleFonts.inter(fontSize: 28, fontWeight: FontWeight.w700, color: Colors.white)),
              Text('Income protection for riders', style: GoogleFonts.inter(color: AppTheme.textSecondary, fontSize: 14)),
              const SizedBox(height: 48),
              TextField(
                controller: _phoneCtrl,
                keyboardType: TextInputType.phone,
                style: GoogleFonts.inter(color: Colors.white),
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(10),
                ],
                decoration: const InputDecoration(
                  labelText: 'Phone number',
                  prefixIcon: Icon(Icons.phone_rounded, color: AppTheme.textSecondary),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _passCtrl,
                obscureText: true,
                style: GoogleFonts.inter(color: Colors.white),
                onSubmitted: (_) => _login(),
                decoration: const InputDecoration(
                  labelText: 'Password',
                  prefixIcon: Icon(Icons.lock_rounded, color: AppTheme.textSecondary),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0xFF7F1D1D).withValues(alpha: 0.5), borderRadius: BorderRadius.circular(10)),
                  child: Text(_error!, style: GoogleFonts.inter(color: const Color(0xFFFCA5A5), fontSize: 13)),
                ),
              ],
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _loading ? null : _login,
                  child: _loading
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Login'),
                ),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RegisterScreen())),
                child: Text('New rider? Register →', style: GoogleFonts.inter(color: AppTheme.primary)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
