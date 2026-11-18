package com.orbitescape.game;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

@CapacitorPlugin(name = "OrbitPostcard")
public class OrbitPostcardPlugin extends Plugin {
    private String filename(PluginCall call) {
        return "Orbit-Escape-stvor.png".equals(call.getString("name"))
            ? "Orbit-Escape-stvor.png" : "Orbit-Escape-beacon.png";
    }

    private byte[] png(PluginCall call) throws IOException {
        String encoded = call.getString("data");
        if (encoded == null || encoded.length() > 12582912) {
            throw new IOException("Unexpected postcard size");
        }
        byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
        if (bytes.length < 8 || bytes[0] != (byte) 0x89 || bytes[1] != 'P'
                || bytes[2] != 'N' || bytes[3] != 'G' || bytes[4] != 13
                || bytes[5] != 10 || bytes[6] != 26 || bytes[7] != 10) {
            throw new IOException("Invalid PNG");
        }
        return bytes;
    }

    @PluginMethod
    public void save(PluginCall call) {
        Intent request = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        request.addCategory(Intent.CATEGORY_OPENABLE);
        request.setType("image/png");
        request.putExtra(Intent.EXTRA_TITLE, filename(call));
        startActivityForResult(call, request, "saveSelected");
    }

    @ActivityCallback
    private void saveSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject answer = new JSObject();
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            answer.put("saved", false);
            call.resolve(answer);
            return;
        }
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) throw new IOException("Document not available");
            output.write(png(call));
        } catch (Exception error) {
            call.reject("Не удалось сохранить открытку", error);
            return;
        }
        answer.put("saved", true);
        call.resolve(answer);
    }

    @PluginMethod
    public void share(PluginCall call) {
        try {
            File folder = new File(getContext().getCacheDir(), "postcards");
            if (!folder.exists() && !folder.mkdirs()) throw new IOException("Cache unavailable");
            File image = new File(folder, filename(call));
            try (OutputStream output = new FileOutputStream(image)) { output.write(png(call)); }
            Uri uri = FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".fileprovider", image);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("image/png");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newRawUri("Orbit Escape", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(Intent.createChooser(send, "Поделиться открыткой"));
                    call.resolve();
                } catch (Exception error) { call.reject("Не удалось открыть выбор приложения", error); }
            });
        } catch (Exception error) { call.reject("Не удалось подготовить открытку", error); }
    }
}
