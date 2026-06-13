import Addresses from "../../model/addresses.model.js";
import { getNextSequence } from "../../model/counter.model.js";
export const updateUserAddress = async (req, res) => {
  try {
    const { address_id, id, ...rest } = req.body || {};
    const addrId = Number(address_id ?? id);
    if (!addrId || Number.isNaN(addrId)) {
      return res.status(400).json({ status: false, message: "address_id required" });
    }
    const updated = await Addresses.findOneAndUpdate(
      { address_id: addrId },
      {
        full_name: rest.FullName,
        email: req.user?.email || rest.email,
        phone: rest.phone1,
        alt_phone: rest.phone2,
        address_line1: rest.address,
        address_line2: rest.address_line2 || rest.district || "",
        city: rest.city,
        district: rest.district,
        state: rest.state,
        postal_code: rest.pinCode,
        country: rest.country,
        FullName: rest.FullName,
        phone1: rest.phone1,
        phone2: rest.phone2,
        email: req.user?.email || rest.email,
        pinCode: rest.pinCode,
        address: rest.address,
        address_line2: rest.address_line2 || rest.district || "",
        district: rest.district,
        addressType: rest.addressType,
      },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ status: false, message: "Address not found" });
    }
    const shaped = {
      id: updated.address_id,
      address_id: updated.address_id,
      FullName: updated.FullName,
      phone1: updated.phone1,
      phone2: updated.phone2,
      email: updated.email || "",
      country: updated.country,
      state: updated.state,
      city: updated.city,
      district: updated.district || updated.address_line2 || "",
      pinCode: updated.pinCode,
      address: updated.address,
      address_line2: updated.address_line2 || "",
      addressType: updated.addressType,
    };
    return res.status(200).json({ status: true, address: shaped, data: shaped });
  } catch (error) {
    console.error("updateUserAddress error:", error);
    return res.status(500).json({ status: false, message: "Failed to update address" });
  }
};
export const getUserAddresses = async (_req, res) => {
  const email = (_req.user?.email || _req.body?.email || "").trim();
  const filter = email ? { email } : {};
  const addresses = await Addresses.find(filter).sort({ createdAt: -1 });
  const mapped = addresses.map((a) => ({
    id: a.address_id || a._id?.toString(),
    address_id: a.address_id,
    FullName: a.FullName || a.full_name || "",
    phone1: a.phone1 || a.phone || "",
    phone2: a.phone2 || a.alt_phone || "",
    email: a.email || "",
    country: a.country || "",
    state: a.state || "",
    city: a.city || "",
    district: a.district || a.address_line2 || "",
    pinCode: a.pinCode || a.postal_code || "",
    address: a.address || a.address_line1 || "",
    address_line2: a.address_line2 || "",
    addressType: a.addressType || "",
  }));
  return res
    .status(200)
    .json({ status: true, addresses: mapped, data: mapped, message: "ok" });
};
export const createNewAddress = async (req, res) => {
  try {
    const payload = req.body || {};
    if (req.user?.email) payload.email = req.user.email;
    if (!payload.address_id) {
      payload.address_id = await getNextSequence("address_id");
    }
    const addr = await Addresses.create({
      address_id: payload.address_id,
      full_name: payload.FullName,
      email: payload.email,
      phone: payload.phone1,
      alt_phone: payload.phone2,
      address_line1: payload.address || "",
      address_line2: payload.address_line2 || payload.district || "",
      city: payload.city,
      district: payload.district,
      state: payload.state,
      postal_code: payload.pinCode,
      country: payload.country || "India",
      FullName: payload.FullName,
      phone1: payload.phone1,
      phone2: payload.phone2,
      pinCode: payload.pinCode,
      address: payload.address,
      address_line2: payload.address_line2 || payload.district || "",
      district: payload.district,
      addressType: payload.addressType,
    });
    const shaped = {
      id: addr.address_id,
      address_id: addr.address_id,
      FullName: addr.FullName,
      phone1: addr.phone1,
      phone2: addr.phone2,
      email: addr.email || "",
      country: addr.country,
      state: addr.state,
      city: addr.city,
      district: addr.district || addr.address_line2 || "",
      pinCode: addr.pinCode,
      address: addr.address,
      address_line2: addr.address_line2 || "",
      addressType: addr.addressType,
    };
    return res
      .status(201)
      .json({ status: true, address: shaped, data: shaped, message: "Address created" });
  } catch (error) {
    console.error("createNewAddress error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to create address" });
  }
};

// ---- Orders: cancel order ----
