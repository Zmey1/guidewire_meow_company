import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';

import 'dart:io';

class ApiService {
  static const String _configuredBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  // `API_BASE_URL` can point a physical device to a LAN host.
  // Without an override, Android defaults to the emulator bridge.
  static String get baseUrl {
    if (_configuredBaseUrl.isNotEmpty) {
      return _configuredBaseUrl;
    }

    try {
      if (Platform.isAndroid)
        return 'http://192.168.1.28:3000/api'; // Android Emulator
      return 'http://localhost:3000/api'; // iOS Simulator or Web
    } catch (_) {
      return 'http://localhost:3000/api'; // Fallback
    }
  }

  static Future<Map<String, String>> _headers() async {
    final user = FirebaseAuth.instance.currentUser;
    final token = await user?.getIdToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Future<Map<String, dynamic>> get(String path) async {
    try {
      final res = await http.get(
        Uri.parse('$baseUrl$path'),
        headers: await _headers(),
      );
      _checkStatus(res);
      return jsonDecode(res.body);
    } catch (e) {
      return {'error': e.toString(), 'success': false}; // Graceful UI handling
    }
  }

  static Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body,
  ) async {
    try {
      final res = await http.post(
        Uri.parse('$baseUrl$path'),
        headers: await _headers(),
        body: jsonEncode(body),
      );
      _checkStatus(res);
      return jsonDecode(res.body);
    } catch (e) {
      return {'error': e.toString(), 'success': false}; // Graceful UI handling
    }
  }

  static void _checkStatus(http.Response res) {
    if (res.statusCode >= 400) {
      final body = jsonDecode(res.body);
      throw ApiException(
        body['error'] ?? 'Request failed (${res.statusCode})',
        res.statusCode,
      );
    }
  }
}

class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, this.statusCode);
  @override
  String toString() => message;
}
