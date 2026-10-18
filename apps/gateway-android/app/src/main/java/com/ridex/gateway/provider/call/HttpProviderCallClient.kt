package com.ridex.gateway.provider.call
import com.ridex.gateway.security.ProviderUrlPolicy
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
class HttpProviderCallClient(private val queuePath: String = "/gateway/v1/calls/queue", private val resultPathTemplate: String = "/gateway/v1/calls/%s/result", private val connectTimeoutMs: Int = 10_000, private val readTimeoutMs: Int = 15_000) : ProviderCallClient {
    override fun fetchPending(baseUrl: String, accessToken: String): Result<List<ProviderCallItem>> = runCatching { requireHttps(baseUrl); require(accessToken.isNotBlank()) { "ACCESS_TOKEN_REQUIRED" }; ProviderCallCodec.parsePendingResponse(executeGet(join(baseUrl, queuePath), accessToken).toString()) }
    override fun postResult(baseUrl: String, accessToken: String, requestId: String, status: CallDeliveryStatus, failureCode: String?): Result<Unit> = runCatching { requireHttps(baseUrl); require(accessToken.isNotBlank()) { "ACCESS_TOKEN_REQUIRED" }; require(requestId.isNotBlank()) { "REQUEST_ID_REQUIRED" }; executePost(join(baseUrl, resultPathTemplate.format(requestId)), accessToken, ProviderCallCodec.buildResult(status, failureCode)) }
    private fun executeGet(url: String, token: String): JSONObject { val c=(URL(url).openConnection() as HttpURLConnection).apply { requestMethod="GET"; connectTimeout=connectTimeoutMs; readTimeout=readTimeoutMs; setRequestProperty("Accept","application/json"); setRequestProperty("Authorization","Bearer $token") }; return try { val code=c.responseCode; val text=if(code in 200..299)c.inputStream.bufferedReader().use{it.readText()} else c.errorStream?.bufferedReader()?.use{it.readText()}.orEmpty(); if(code==401||code==403)throw SecurityException("PROVIDER_CALL_UNAUTHORIZED_$code"); if(code !in 200..299)throw IOException(classify(code)); JSONObject(text) } finally { c.disconnect() } }
    private fun executePost(url:String,token:String,body:String){ val c=(URL(url).openConnection() as HttpURLConnection).apply{requestMethod="POST";connectTimeout=connectTimeoutMs;readTimeout=readTimeoutMs;doInput=true;doOutput=true;useCaches=false;setRequestProperty("Accept","application/json");setRequestProperty("Content-Type","application/json; charset=utf-8");setRequestProperty("Authorization","Bearer $token")}; try{c.outputStream.use{it.write(body.toByteArray(Charsets.UTF_8))};val code=c.responseCode;if(code==401||code==403)throw SecurityException("PROVIDER_CALL_RESULT_UNAUTHORIZED_$code");if(code !in 200..299)throw IOException(classify(code))}finally{c.disconnect()} }
    private fun classify(code:Int)=when{code==429->"PROVIDER_HTTP_429";code>=500->"PROVIDER_HTTP_5XX";code>=400->"PROVIDER_HTTP_4XX";else->"PROVIDER_HTTP_$code"}
    private fun requireHttps(baseUrl:String){ ProviderUrlPolicy.requireSafeHttps(baseUrl) }
    private fun join(base:String,path:String)=base.trimEnd('/')+"/"+path.trimStart('/')
}
