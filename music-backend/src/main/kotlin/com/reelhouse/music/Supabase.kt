package com.reelhouse.music

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

private fun enc(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)

class SupabaseAuth(
    private val config: AppConfig,
    private val http: ExternalHttp,
) {
    private data class CacheEntry(val user: AuthUser, val expiresAt: Long)

    private val cache = ConcurrentHashMap<String, CacheEntry>()

    suspend fun authenticate(token: String?): AuthUser? {
        if (!config.supabaseConfigured) return null
        if (token.isNullOrBlank() || token.length > 16_384) return null
        val cacheKey = sha256(token)
        cache[cacheKey]?.takeIf { it.expiresAt > System.currentTimeMillis() }?.let { return it.user }
        val url = "${config.supabaseUrl!!.trimEnd('/')}/auth/v1/user"
        val response = runCatching {
            http.get(
                url,
                headers = mapOf(
                    "apikey" to config.supabaseAnonKey!!,
                    "Authorization" to "Bearer $token",
                    "Accept" to "application/json",
                ),
            )
        }.getOrNull() ?: return null
        if (response.status != 200) return null
        val obj = runCatching { AppJson.parseToJsonElement(response.body).asObjectOrNull() }.getOrNull() ?: return null
        val id = obj["id"].asStringOrNull() ?: return null
        val user = AuthUser(
            id = id,
            email = obj["email"].asStringOrNull(),
        )
        cache[cacheKey] = CacheEntry(user, System.currentTimeMillis() + 60_000)
        if (cache.size > 2_000) {
            val now = System.currentTimeMillis()
            cache.entries.removeIf { it.value.expiresAt <= now }
        }
        return user
    }
}

class SupabaseRest(
    private val config: AppConfig,
    private val http: ExternalHttp,
) {
    val enabled: Boolean
        get() = config.supabaseConfigured

    private val base: String
        get() = config.supabaseUrl!!.trimEnd('/')

    private val serviceHeaders: Map<String, String>
        get() = mapOf(
            "apikey" to config.supabaseServiceRoleKey!!,
            "Authorization" to "Bearer ${config.supabaseServiceRoleKey}",
            "Accept" to "application/json",
        )

    suspend fun select(table: String, query: String = ""): List<JsonObject> {
        ensureEnabled()
        val url = "$base/rest/v1/${enc(table)}${if (query.isBlank()) "" else "?$query"}"
        val response = http.get(url, serviceHeaders)
        if (response.status !in 200..299) throw restError("select", table, response)
        return runCatching { AppJson.parseToJsonElement(response.body).asArrayOrNull() }
            .getOrNull()
            ?.mapNotNull { it.asObjectOrNull() }
            ?: emptyList()
    }

    suspend fun insert(
        table: String,
        rows: List<JsonObject>,
        onConflict: String? = null,
        ignoreDuplicates: Boolean = false,
    ): JsonArray {
        if (rows.isEmpty()) return JsonArray(emptyList())
        ensureEnabled()
        val params = buildList {
            if (onConflict != null) add("on_conflict=${enc(onConflict)}")
            add("select=*")
        }.joinToString("&")
        val preference = if (ignoreDuplicates) "resolution=ignore-duplicates" else "resolution=merge-duplicates"
        val response = http.postJson(
            "$base/rest/v1/${enc(table)}?$params",
            AppJson.encodeToString(JsonArray.serializer(), JsonArray(rows)),
            serviceHeaders + mapOf("Prefer" to "$preference,return=representation"),
        )
        if (response.status !in 200..299) throw restError("write", table, response)
        return runCatching { AppJson.parseToJsonElement(response.body).asArrayOrNull() }
            .getOrNull()
            ?: JsonArray(emptyList())
    }

    suspend fun insertOne(
        table: String,
        row: JsonObject,
        onConflict: String? = null,
        ignoreDuplicates: Boolean = false,
    ): JsonObject? = insert(table, listOf(row), onConflict, ignoreDuplicates).firstOrNull()?.asObjectOrNull()

    suspend fun update(table: String, query: String, patch: JsonObject): JsonArray {
        ensureEnabled()
        val response = http.postJson(
            "$base/rest/v1/${enc(table)}?$query&select=*",
            AppJson.encodeToString(JsonObject.serializer(), patch),
            serviceHeaders + mapOf("Prefer" to "return=representation"),
        )
        if (response.status !in 200..299) throw restError("update", table, response)
        return runCatching { AppJson.parseToJsonElement(response.body).asArrayOrNull() }
            .getOrNull()
            ?: JsonArray(emptyList())
    }

    suspend fun delete(table: String, query: String) {
        ensureEnabled()
        val response = http.delete("$base/rest/v1/${enc(table)}?$query", serviceHeaders)
        if (response.status !in 200..299 && response.status != 404) throw restError("delete", table, response)
    }

    suspend fun maybeSingle(table: String, query: String): JsonObject? =
        select(table, "$query&limit=1").firstOrNull()?.asObjectOrNull()

    fun eq(value: String): String = "eq.${enc(value)}"

    private fun ensureEnabled() {
        if (!enabled) throw ApiException(503, "supabase_not_configured", "Supabase is not configured on the music backend")
    }

    private fun restError(operation: String, table: String, response: TextHttpResponse): ApiException {
        val code = response.body.take(300).let { body ->
            runCatching {
                AppJson.parseToJsonElement(body).asObjectOrNull()?.get("code").asStringOrNull()
            }.getOrNull()
        }
        val missing = code == "PGRST205" || response.status == 404
        val status = if (missing) 503 else 502
        return ApiException(
            status,
            if (missing) "schema_not_applied" else "supabase_error",
            if (missing) {
                "The music database schema is not up to date. Apply the music migrations in Supabase."
            } else {
                "The music database could not complete $operation on $table"
            },
        )
    }
}

fun sha256(value: String): String =
    MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

fun JsonObject.withUserId(userId: String): JsonObject = buildJsonObject {
    put("user_id", userId)
    for ((key, value) in this@withUserId) put(key, value)
}
