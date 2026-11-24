package com.reelhouse.music

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

val AppJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
    isLenient = false
}

inline fun <reified T> decodeJson(text: String): T = AppJson.decodeFromString(text)

inline fun <reified T> encodeJson(value: T): String = AppJson.encodeToString(value)

fun JsonElement?.asObjectOrNull(): JsonObject? =
    this?.takeIf { it !is JsonNull }?.let { runCatching { it.jsonObject }.getOrNull() }

fun JsonElement?.asArrayOrNull(): JsonArray? =
    this?.takeIf { it !is JsonNull }?.let { runCatching { it.jsonArray }.getOrNull() }

fun JsonObject?.obj(vararg path: String): JsonObject? {
    var current: JsonElement? = this
    for (part in path) {
        current = current.asObjectOrNull()?.get(part) ?: return null
    }
    return current.asObjectOrNull()
}

fun JsonObject?.arr(vararg path: String): JsonArray? {
    var current: JsonElement? = this
    for (part in path) {
        current = current.asObjectOrNull()?.get(part) ?: return null
    }
    return current.asArrayOrNull()
}

fun JsonObject?.str(vararg path: String): String? {
    var current: JsonElement? = this
    for (part in path) {
        current = current.asObjectOrNull()?.get(part) ?: return null
    }
    return current.asStringOrNull()
}

fun JsonElement?.asStringOrNull(): String? {
    if (this == null || this is JsonNull) return null
    return runCatching { jsonPrimitive.contentOrNull }.getOrNull()?.takeIf { it.isNotBlank() }
}

fun JsonElement?.asIntOrNull(): Int? {
    if (this == null || this is JsonNull) return null
    return runCatching { jsonPrimitive.intOrNull ?: jsonPrimitive.contentOrNull?.toIntOrNull() }.getOrNull()
}

fun JsonElement?.asLongOrNull(): Long? {
    if (this == null || this is JsonNull) return null
    return runCatching { jsonPrimitive.longOrNull ?: jsonPrimitive.contentOrNull?.toLongOrNull() }.getOrNull()
}

fun JsonElement?.asDoubleOrNull(): Double? {
    if (this == null || this is JsonNull) return null
    return runCatching { jsonPrimitive.doubleOrNull ?: jsonPrimitive.contentOrNull?.toDoubleOrNull() }.getOrNull()
}

fun JsonElement?.asBooleanOrNull(): Boolean? {
    if (this == null || this is JsonNull) return null
    return runCatching { jsonPrimitive.booleanOrNull }.getOrNull()
}

fun textRuns(element: JsonElement?): String? {
    val obj = element.asObjectOrNull() ?: return null
    val runs = obj["runs"].asArrayOrNull()
    if (runs != null) {
        val text = runs.joinToString("") { run ->
            run.asObjectOrNull()?.get("text").asStringOrNull().orEmpty()
        }.trim()
        if (text.isNotEmpty()) return text
    }
    return obj["simpleText"].asStringOrNull()?.trim()?.takeIf(String::isNotEmpty)
}

fun JsonElement?.collectObjects(key: String): List<JsonObject> {
    val out = ArrayList<JsonObject>()
    fun visit(element: JsonElement?) {
        when (element) {
            is JsonObject -> {
                for ((name, value) in element) {
                    if (name == key && value is JsonObject) out.add(value)
                    else visit(value)
                }
            }
            is JsonArray -> element.forEach(::visit)
            else -> Unit
        }
    }
    visit(this)
    return out
}

fun JsonElement?.firstObject(key: String): JsonObject? = collectObjects(key).firstOrNull()

fun largestThumbnail(element: JsonElement?): String? {
    val thumbnailArrays = element.collectObjects("thumbnails")
    val candidates = ArrayList<Triple<String, Int, Int>>()
    fun visit(value: JsonElement?) {
        when (value) {
            is JsonObject -> value.forEach { (key, child) ->
                if (key == "thumbnails") {
                    child.asArrayOrNull()?.forEach { item ->
                        val obj = item.asObjectOrNull() ?: return@forEach
                        val url = obj["url"].asStringOrNull() ?: return@forEach
                        candidates += Triple(
                            url,
                            obj["width"].asIntOrNull() ?: 0,
                            obj["height"].asIntOrNull() ?: 0,
                        )
                    }
                } else visit(child)
            }
            is JsonArray -> value.forEach(::visit)
            else -> Unit
        }
    }
    visit(element)
    if (candidates.isEmpty() && thumbnailArrays.isNotEmpty()) return null
    return candidates.asSequence()
        .maxByOrNull { (_, width, height) -> width.toLong() * height.toLong() }
        ?.first
        ?.takeIf { it.startsWith("https://") || it.startsWith("http://") }
}

fun JsonObject.stringList(key: String): List<String> =
    this[key].asArrayOrNull()?.mapNotNull { it.asStringOrNull() }.orEmpty()
