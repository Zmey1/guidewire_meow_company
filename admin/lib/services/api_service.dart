import 'dart:convert';

import 'package:http/http.dart' as http;

import 'auth_service.dart';

class ApiService {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api',
  );

  static Future<Map<String, String>> _headers() async {
    final token = await AuthService.getIdToken(forceRefresh: true);
    if (token == null || token.isEmpty) {
      throw ApiException('Not signed in', 401);
    }

    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  static Future<Map<String, dynamic>> get(String path) async {
    return _request(() async {
      final res = await http.get(
        Uri.parse('$baseUrl$path'),
        headers: await _headers(),
      );
      return res;
    });
  }

  static Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body,
  ) async {
    return _request(() async {
      final res = await http.post(
        Uri.parse('$baseUrl$path'),
        headers: await _headers(),
        body: jsonEncode(body),
      );
      return res;
    });
  }

  static Future<Map<String, dynamic>> patch(
    String path,
    Map<String, dynamic> body,
  ) async {
    return _request(() async {
      final res = await http.patch(
        Uri.parse('$baseUrl$path'),
        headers: await _headers(),
        body: jsonEncode(body),
      );
      return res;
    });
  }

  static Future<Map<String, dynamic>> _request(
    Future<http.Response> Function() call,
  ) async {
    try {
      final res = await call();
      final body = _decodeBody(res.body);

      if (res.statusCode >= 400) {
        final errorMessage = _extractErrorMessage(body, res.statusCode);
        if (res.statusCode == 401) {
          await AuthService.signOut();
        }
        return {
          'success': false,
          'error': errorMessage,
          'statusCode': res.statusCode,
        };
      }

      if (body is Map<String, dynamic>) {
        return body;
      }

      return {
        'success': true,
        'data': body,
      };
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        await AuthService.signOut();
      }
      return {
        'success': false,
        'error': e.message,
        'statusCode': e.statusCode,
      };
    } catch (e) {
      return {
        'success': false,
        'error': e.toString(),
      };
    }
  }

  static dynamic _decodeBody(String body) {
    if (body.trim().isEmpty) {
      return <String, dynamic>{};
    }

    try {
      return jsonDecode(body);
    } catch (_) {
      return <String, dynamic>{'error': body};
    }
  }

  static String _extractErrorMessage(dynamic body, int statusCode) {
    if (body is Map<String, dynamic>) {
      final error = body['error'];
      if (error != null && error.toString().trim().isNotEmpty) {
        return error.toString();
      }
    }

    return 'Request failed ($statusCode)';
  }
}

class ApiException implements Exception {
  final String message;
  final int statusCode;

  ApiException(this.message, this.statusCode);

  @override
  String toString() => message;
}
